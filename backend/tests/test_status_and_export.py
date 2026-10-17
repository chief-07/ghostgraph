"""
Unit tests for Bug #8 (FalkorDB Connection Transparency) and Bug #9 (Export Candidate Packaging).
"""

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
