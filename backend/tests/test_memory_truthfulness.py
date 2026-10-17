"""
Unit tests for Bug #6 and Bug #7:
- Bug #6: Memory Resolution Truthfulness (eliminating fallback fabrication when provenance is absent).
- Bug #7: Elimination of synthetic READS edges; streaming authentic FalkorDB READS/WRITES edges.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import pytest
from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools import cypher_tools
from backend.agents.topology_agent import TopologyAgent
from backend.agents.supervisor_agent import SupervisorAgent

def test_grounded_memory_resolution_lunar_lander():
    """Verify that a real memory address (00540 LOWCRIT) resolves its authentic producer from FalkorDB."""
    falkor_client.select_target_graph("lunar_lander")
    falkor_client.clear_graph()

    topology = TopologyAgent()
    topology.ingest_target("backend/data/targets/lunar_lander_decompiled.json", target_id="lunar_lander")

    # Direct Cypher tool check
    prov = cypher_tools.resolve_memory_source("00540")
    assert len(prov) > 0, "Expected provenance records for 00540"
    assert prov[0].get("producer_function") == "BURN_BABY_BURN_MASTER_IGNITION"
    assert prov[0].get("label") == "LOWCRIT"

    # Verify supervisor emits MEMORY_RESOLVED with real FalkorDB data
    supervisor = SupervisorAgent()
    events = []
    # Only iterate up to Step 2
    for event in supervisor.run_reconstruction_pipeline("lunar_lander", use_graph_context=True, max_iterations=1):
        events.append(event)
        if event.get("type") in ("MEMORY_RESOLVED", "MEMORY_UNRESOLVED"):
            break

    resolved_events = [e for e in events if e.get("type") == "MEMORY_RESOLVED"]
    unresolved_events = [e for e in events if e.get("type") == "MEMORY_UNRESOLVED"]

    assert len(resolved_events) == 1, "Should have emitted MEMORY_RESOLVED for 00540"
    assert len(unresolved_events) == 0, "Should NOT have emitted MEMORY_UNRESOLVED for grounded 00540"
    assert resolved_events[0]["address"] == "00540"
    assert resolved_events[0]["producer"] == "BURN_BABY_BURN_MASTER_IGNITION"
    assert resolved_events[0]["label"] == "LOWCRIT"

def test_ungrounded_memory_truthfulness_no_fabrication(monkeypatch):
    """Verify that an ungrounded memory address truthfully returns MEMORY_UNRESOLVED without fabrication (Bug #6)."""
    falkor_client.select_target_graph("lunar_lander")
    falkor_client.clear_graph()

    topology = TopologyAgent()
    topology.ingest_target("backend/data/targets/lunar_lander_decompiled.json", target_id="lunar_lander")

    # An unknown address should return empty from FalkorDB
    prov = cypher_tools.resolve_memory_source("0xDEADBEEF")
    assert len(prov) == 0, "Unknown address should have zero provenance records"

    # Temporarily set critical_mem to an ungrounded address to test supervisor behavior
    from backend.agents import supervisor_agent
    test_cfg = dict(supervisor_agent.TARGET_CONFIGS["lunar_lander"])
    test_cfg["critical_mem"] = "0xDEADBEEF"
    test_cfg["mem_label"] = "UNRESOLVED_POINTER"
    test_cfg["producer_fn"] = "NON_EXISTENT_PRODUCER"

    monkeypatch.setitem(supervisor_agent.TARGET_CONFIGS, "lunar_lander", test_cfg)

    supervisor = SupervisorAgent()
    events = []
    for event in supervisor.run_reconstruction_pipeline("lunar_lander", use_graph_context=True, max_iterations=1):
        events.append(event)
        if event.get("type") in ("MEMORY_RESOLVED", "MEMORY_UNRESOLVED"):
            break

    resolved_events = [e for e in events if e.get("type") == "MEMORY_RESOLVED"]
    unresolved_events = [e for e in events if e.get("type") == "MEMORY_UNRESOLVED"]

    # Must NOT fabricate MEMORY_RESOLVED
    assert len(resolved_events) == 0, "Supervisor must NOT emit MEMORY_RESOLVED when graph provenance is missing!"
    assert len(unresolved_events) == 1, "Supervisor MUST emit MEMORY_UNRESOLVED for ungrounded pointer!"
    assert unresolved_events[0]["address"] == "0xDEADBEEF"
    assert "could not be resolved" in unresolved_events[0]["message"]

def test_truthful_memory_edges_streamed_no_synthetic_all_reads():
    """Verify that Step 1 streams actual READS/WRITES edges from FalkorDB and does not connect every buffer to primary_fn (Bug #7)."""
    falkor_client.select_target_graph("lunar_lander")
    falkor_client.clear_graph()

    topology = TopologyAgent()
    topology.ingest_target("backend/data/targets/lunar_lander_decompiled.json", target_id="lunar_lander")

    supervisor = SupervisorAgent()
    step1_events = []
    for event in supervisor.run_reconstruction_pipeline("lunar_lander", use_graph_context=True, max_iterations=1):
        step1_events.append(event)
        if event.get("action") == "NATIVE_GRAPH_ALGORITHM_PAGERANK":
            break

    # Check edges streamed in Step 1
    edge_events = [e for e in step1_events if e.get("type") == "EDGE_DISCOVERED"]
    
    # 01400 (RADAR_ALT) is read by P66_ROD_GUIDANCE and EVALUATE_TOUCHDOWN, NOT THROTTLE_CONTROL_ROUTINES
    radar_reads_from_primary = [
        e for e in edge_events
        if e.get("source") == "THROTTLE_CONTROL_ROUTINES" and e.get("target") == "01400" and e.get("label") == "READS"
    ]
    assert len(radar_reads_from_primary) == 0, "THROTTLE_CONTROL_ROUTINES must not have synthetic READS edge to RADAR_ALT (01400)"

    # Genuine edges must be streamed
    tcr_reads_00540 = [
        e for e in edge_events
        if e.get("source") == "THROTTLE_CONTROL_ROUTINES" and e.get("target") == "00540" and e.get("label") == "READS"
    ]
    assert len(tcr_reads_00540) == 1, "Expected authentic READS edge from THROTTLE_CONTROL_ROUTINES to 00540"

    ign_writes_00540 = [
        e for e in edge_events
        if e.get("source") == "BURN_BABY_BURN_MASTER_IGNITION" and e.get("target") == "00540" and e.get("label") == "WRITES"
    ]
    assert len(ign_writes_00540) == 1, "Expected authentic WRITES edge from BURN_BABY_BURN_MASTER_IGNITION to 00540"
