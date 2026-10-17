"""
Unit test verifying Problem 4 (Custom Binary Upload Ingestion) and Problem 5 (Verified READS Edge).
Proves that:
1. /api/upload disassembles binary bytes and ingests directly into an isolated FalkorDB multigraph via TopologyAgent.
2. Supervisor does not fall back to Lunar Lander when executing custom uploaded binaries.
3. Supervisor queries FalkorDB to verify whether a function actually reads a memory address before emitting a READS edge.
"""

import sys
import os
import unittest
from starlette.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app import app, TARGETS, TARGET_CONFIGS
from backend.agents.topology_agent import topology_agent
from backend.agents.supervisor_agent import supervisor_agent
from backend.mcp_tools.falkor_client import falkor_client


def test_topology_agent_ingest_binary():
    """Verify topology_agent.ingest_binary parses x86-64 bytes and creates graph elements in FalkorDB."""
    # Machine code:
    # 0x00401000: push rbp (55)
    # 0x00401001: mov rbp, rsp (48 89 e5)
    # 0x00401004: mov rax, qword ptr [rip + 0x1000] (48 8b 05 00 10 00 00) -> reads 0x0040200b
    # 0x0040100b: call 0x00401015 (e8 05 00 00 00)
    # 0x00401010: leave (c9)
    # 0x00401011: ret (c3)
    # 0x00401015: nop (90)
    # 0x00401016: ret (c3)
    raw_code = bytes([
        0x55,
        0x48, 0x89, 0xe5,
        0x48, 0x8b, 0x05, 0x00, 0x10, 0x00, 0x00,
        0xe8, 0x05, 0x00, 0x00, 0x00,
        0xc9,
        0xc3,
        0x90,
        0xc3
    ])

    res = topology_agent.ingest_binary(
        binary_data=raw_code,
        program_name="unit_test_bin",
        target_id="test_custom_upload"
    )

    assert res["status"] == "INGESTED"
    assert res["functions_count"] >= 1
    assert res["total_instructions"] >= 5
    assert "primary_fn" in res
    assert "critical_mem" in res

    # Verify nodes in FalkorDB
    falkor_client.select_target_graph("test_custom_upload")
    fns = falkor_client.ro_query("MATCH (f:Function) RETURN count(f) AS cnt")
    assert fns[0]["cnt"] >= 1, "Expected Function nodes in FalkorDB test_custom_upload multigraph"


def test_api_upload_registers_isolated_multigraph():
    """Verify /api/upload endpoint connects directly to FalkorDB multigraph and does not default to Lunar Lander."""
    client = TestClient(app)

    raw_code = bytes([0x55, 0x48, 0x89, 0xe5, 0x90, 0xc9, 0xc3])
    response = client.post(
        "/api/upload",
        files={"file": ("firmware_payload.bin", raw_code, "application/octet-stream")}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "INGESTED"
    target_id = data["target_id"]
    assert target_id.startswith("upload_")
    assert "multigraph" in data

    # Verify registered target has is_custom_upload flag
    assert target_id in TARGET_CONFIGS
    assert TARGET_CONFIGS[target_id].get("is_custom_upload") is True
    assert TARGET_CONFIGS["custom_upload"].get("is_custom_upload") is True


def test_supervisor_does_not_overwrite_custom_upload_with_lunar_lander():
    """Verify supervisor pipeline preserves custom upload graph and engages dedicated multigraph."""
    target_id = "test_custom_upload"

    # Ingest a custom upload specimen
    raw_code = bytes([0x55, 0x48, 0x89, 0xe5, 0x90, 0xc9, 0xc3])
    topology_agent.ingest_binary(
        binary_data=raw_code,
        program_name="custom_specimen.bin",
        target_id=target_id
    )

    TARGET_CONFIGS[target_id] = {
        "name": "Custom Specimen",
        "primary_fn": "main_entry",
        "critical_mem": "0x00403000",
        "producer_fn": "init_subroutine",
        "is_custom_upload": True
    }

    events = []
    for ev in supervisor_agent.run_reconstruction_pipeline(target_name=target_id, max_iterations=1):
        events.append(ev)

    event_messages = [e.get("message", "") for e in events]
    # Verify that custom binary graph was engaged
    engaged = any("CUSTOM_BINARY_GRAPH_ENGAGED" == e.get("action") for e in events)
    assert engaged, "Supervisor must engage CUSTOM_BINARY_GRAPH_ENGAGED for custom upload"

    # Verify that lunar lander decompiled JSON was NOT loaded
    assert not any("Apollo 11" in msg for msg in event_messages)


def test_supervisor_verifies_reads_edge_before_emission():
    """Verify supervisor queries FalkorDB does_read and only emits READS edge if verified (Problem 5)."""
    target_id = "test_edge_verification"
    falkor_client.select_target_graph(target_id)

    # Setup graph:
    # Function 'producer_fn' WRITES to '0x00409000'
    # Function 'consumer_fn' READS from '0x00409000'
    # Function 'unrelated_fn' does NOT read from '0x00409000'
    falkor_client.query("MERGE (p:Function {name: 'producer_fn'})")
    falkor_client.query("MERGE (c:Function {name: 'consumer_fn'})")
    falkor_client.query("MERGE (u:Function {name: 'unrelated_fn'})")
    falkor_client.query("MERGE (m:GlobalMemory {address: '0x00409000', label: 'CRIT_DATA'})")
    falkor_client.query("MATCH (p:Function {name: 'producer_fn'}), (m:GlobalMemory {address: '0x00409000'}) MERGE (p)-[:WRITES]->(m)")
    falkor_client.query("MATCH (c:Function {name: 'consumer_fn'}), (m:GlobalMemory {address: '0x00409000'}) MERGE (c)-[:READS]->(m)")

    # 1. Test when function DOES read the memory:
    TARGET_CONFIGS[target_id] = {
        "name": "Test Target",
        "primary_fn": "consumer_fn",
        "critical_mem": "0x00409000",
        "producer_fn": "producer_fn",
        "is_custom_upload": True
    }

    events_consumer = list(supervisor_agent.run_reconstruction_pipeline(target_name=target_id, max_iterations=1))
    reads_edges = [
        e for e in events_consumer
        if e.get("type") == "EDGE_DISCOVERED" and e.get("label") == "READS" and e.get("source") == "consumer_fn"
    ]
    assert len(reads_edges) >= 1, "Supervisor must emit READS edge when FalkorDB confirms consumer_fn reads crit_mem"

    # 2. Test when function does NOT read the memory:
    TARGET_CONFIGS[target_id]["primary_fn"] = "unrelated_fn"
    events_unrelated = list(supervisor_agent.run_reconstruction_pipeline(target_name=target_id, max_iterations=1))
    unverified_reads_edges = [
        e for e in events_unrelated
        if e.get("type") == "EDGE_DISCOVERED" and e.get("label") == "READS" and e.get("source") == "unrelated_fn"
    ]
    assert len(unverified_reads_edges) == 0, "Supervisor must NOT emit READS edge when unrelated_fn does not read crit_mem"
