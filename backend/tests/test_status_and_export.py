"""
Unit tests for Bug #8 (FalkorDB Connection Transparency) and Bug #9 (Export Candidate Packaging).
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools import cypher_tools

client = TestClient(app)

def test_falkordb_status_transparency():
    """Verify that /api/falkordb/status truthfully reports connection mode, host, and metrics (Bug #8)."""
    status_data = falkor_client.get_status()
    assert "connected" in status_data
    assert "mode" in status_data
    assert status_data["mode"] in ("FalkorDB Cloud", "In-Memory Simulation")
    assert "graph_name" in status_data
    assert "nodes_count" in status_data
    assert "edges_count" in status_data

    # Test API endpoint
    response = client.get("/api/falkordb/status")
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["connected"] == status_data["connected"]
    assert res_json["mode"] == status_data["mode"]
    assert res_json["graph_name"] == status_data["graph_name"]

def test_export_baseline_when_no_candidate():
    """Verify /api/export provides valid baseline, makefile, certificate, and audit trail when no candidate exists."""
    falkor_client.select_target_graph("billing")
    falkor_client.clear_graph()

    response = client.get("/api/export?target_id=billing")
    assert response.status_code == 200
    data = response.json()

    assert data["target"] == "billing"
    assert "billing_reconstructed" in data["filename"]
    assert "source_code" in data
    assert "makefile" in data
    assert "compile_cmd" in data
    assert "certificate" in data
    assert "cypher_audit_trail" in data

    cert = data["certificate"]
    assert cert["target_id"] == "billing"
    assert cert["candidate_id"] == "baseline_unverified"
    assert cert["status"] == "BASELINE_UNVERIFIED"
    assert cert["parity_percentage"] == 0.0

def test_export_packages_synthesized_candidate_and_verification():
    """Verify /api/export packages authentic synthesized candidate code, certificate, and Cypher trace (Bug #9)."""
    falkor_client.select_target_graph("lunar_lander")
    falkor_client.clear_graph()

    test_candidate_code = """# Reconstructed Apollo Guidance Throttle Control Subroutine
def THROTTLE_CONTROL_ROUTINES(desired_accel):
    lowcrit = 0.10
    highcrit = 0.60
    fc = desired_accel * 15103.0
    throttle = fc / 45000.0
    if throttle <= lowcrit:
        return lowcrit
    elif throttle > highcrit:
        return 1.00
    return throttle
"""
    # Record Candidate in FalkorDB
    cand_id = cypher_tools.record_candidate(
        function_name="THROTTLE_CONTROL_ROUTINES",
        source_code=test_candidate_code,
        version=2,
        status="VERIFIED",
        target_name="lunar_lander"
    )

    # Record verified differential test outcomes
    for i in range(1, 21):
        cypher_tools.record_test_outcome(cand_id, f"TC_{i:02d}", passed=True)

    # Call /api/export
    response = client.get("/api/export?target_id=lunar_lander")
    assert response.status_code == 200
    data = response.json()

    # Must export the actual candidate code, NOT a hardcoded mock
    assert data["is_candidate"] is True
    assert data["candidate_id"] == cand_id
    assert data["version"] == 2
    assert "THROTTLE_CONTROL_ROUTINES" in data["source_code"]
    assert "15103.0" in data["source_code"]

    # Verify certificate details
    cert = data["certificate"]
    assert cert["candidate_id"] == cand_id
    assert cert["candidate_version"] == 2
    assert cert["status"] == "VERIFIED_MATHEMATICAL_PARITY"
    assert cert["parity_percentage"] == 100.0
    assert cert["test_vectors_passed"] == 20
    assert cert["test_vectors_total"] == 20

    # Verify Cypher audit trail contains required provenance queries
    trail = data["cypher_audit_trail"]
    assert "MATCH (p:Program)-[:CONTAINS]->(f:Function" in trail
    assert "MATCH (mem:GlobalMemory" in trail
    assert "shortestPath" in trail
    assert "PASSED" in trail

def test_export_broken_candidate_truthfully_fails_without_fabrication():
    """Verify /api/export does NOT fabricate 100% parity on broken candidates (Problem 2)."""
    falkor_client.select_target_graph("billing")
    falkor_client.clear_graph()

    broken_code = """
def compute_progressive_tax(taxable_amount):
    return 0.0
"""
    # Record Candidate in FalkorDB WITHOUT pre-recording passing test outcomes
    cand_id = cypher_tools.record_candidate(
        function_name="compute_progressive_tax",
        source_code=broken_code,
        version=1,
        status="UNVERIFIED",
        target_name="billing"
    )

    response = client.get("/api/export?target_id=billing")
    assert response.status_code == 200
    data = response.json()

    assert data["is_candidate"] is True
    assert data["candidate_id"] == cand_id

    cert = data["certificate"]
    # Candidate returns 0.0 tax; it fails progressive tax calculations.
    # Must NOT report 100.0% or VERIFIED_MATHEMATICAL_PARITY!
    assert cert["status"] == "PARITY_MISMATCH"
    assert cert["parity_percentage"] < 50.0
    assert cert["test_vectors_passed"] < 10
    assert cert["test_vectors_total"] == 20

def test_export_grounded_candidate_auto_evaluates_real_parity():
    """Verify /api/export dynamically executes grounded candidate when no tests pre-recorded."""
    falkor_client.select_target_graph("billing")
    falkor_client.clear_graph()

    grounded_code = """
def compute_progressive_tax(taxable_amount):
    if taxable_amount <= 0.0:
        return 0.0
    brackets = [(100.0, 0.0), (500.0, 0.05), (2000.0, 0.12), (1e12, 0.20)]
    total_tax = 0.0
    prev_threshold = 0.0
    for threshold, rate in brackets:
        if taxable_amount > prev_threshold:
            in_bracket = min(taxable_amount, threshold) - prev_threshold
            total_tax += in_bracket * rate
        else:
            break
        prev_threshold = threshold
    return round(total_tax, 2)
"""
    cand_id = cypher_tools.record_candidate(
        function_name="compute_progressive_tax",
        source_code=grounded_code,
        version=1,
        status="UNVERIFIED",
        target_name="billing"
    )

    response = client.get("/api/export?target_id=billing")
    assert response.status_code == 200
    data = response.json()

    assert data["is_candidate"] is True
    cert = data["certificate"]
    assert cert["status"] == "VERIFIED_MATHEMATICAL_PARITY"
    assert cert["parity_percentage"] == 100.0
    assert cert["test_vectors_passed"] == 20
    assert cert["test_vectors_total"] == 20

