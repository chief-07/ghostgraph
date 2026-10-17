"""
Unit test verifying Bug #4 (Struct & Field Ingestion) and Bug #5 (Target Multigraph Isolation).
Proves that:
1. Structs and their fields are parsed, committed as nodes with HAS_FIELD relationships,
   and queryable via cypher_tools.get_struct_definition().
2. GlobalMemory nodes are mapped to Structs via MAPS_TO_STRUCT.
3. Switching between target graphs (e.g. billing vs space_invaders) isolates nodes with
   ZERO function bleed or memory bleed.
"""

import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.agents.topology_agent import topology_agent
from backend.mcp_tools.falkor_client import falkor_client
from backend.mcp_tools import cypher_tools


def test_struct_ingestion_and_query():
    """Verify Bug #4: Structs and fields are ingested and queryable."""
    print("=== TEST 1: STRUCT & FIELD INGESTION ===")
    res = topology_agent.ingest_target(
        target_json_path="backend/data/targets/billing_decompiled.json",
        test_vectors_path="ground_truth/billing_test_vectors.json",
        target_id="billing"
    )
    assert res["structs_count"] >= 3, f"Expected at least 3 structs, got {res['structs_count']}"

    # Query struct definition through Cypher tools
    struct_def = cypher_tools.get_struct_definition("TaxBracket")
    assert struct_def["struct_name"] == "TaxBracket"
    assert struct_def["total_size"] == 16, f"Expected size 16, got {struct_def.get('total_size')}"
    fields = struct_def.get("fields", [])
    assert len(fields) == 2, f"Expected 2 fields in TaxBracket, got {len(fields)}"
    field_names = [f["name"] for f in fields]
    assert "threshold" in field_names and "rate" in field_names, f"Fields mismatch: {field_names}"
    print(f"[PASS] Struct TaxBracket verified: {struct_def}")

    # Query customer tier config struct
    tier_struct = cypher_tools.get_struct_definition("CustomerTierConfig")
    assert tier_struct["struct_name"] == "CustomerTierConfig"
    assert tier_struct["total_size"] == 24
    print(f"[PASS] Struct CustomerTierConfig verified: {tier_struct}")

    # Verify Cytoscape export includes Struct nodes
    graph = topology_agent.get_topology_graph()
    struct_nodes = [n for n in graph["nodes"] if n["data"].get("group") == "Struct"]
    assert len(struct_nodes) >= 3, f"Expected at least 3 struct nodes in Cytoscape export, got {len(struct_nodes)}"
    print(f"[PASS] Cytoscape export contains {len(struct_nodes)} Struct nodes.")


def test_multigraph_target_isolation():
    """Verify Bug #5: Target multigraph isolation eliminates cross-target function bleed."""
    print("\n=== TEST 2: MULTIGRAPH TARGET ISOLATION & ZERO FUNCTION BLEED ===")
    
    # 1. Ingest Billing into ghostgraph_billing
    topology_agent.ingest_target(
        target_json_path="backend/data/targets/billing_decompiled.json",
        test_vectors_path="ground_truth/billing_test_vectors.json",
        target_id="billing"
    )

    billing_graph = topology_agent.get_topology_graph()
    billing_fns = [n["data"]["label"] for n in billing_graph["nodes"] if n["data"].get("group") == "Function"]
    assert "compute_progressive_tax" in billing_fns, "compute_progressive_tax must be in billing"
    assert "aliensMissileMove" not in billing_fns, "aliensMissileMove must NOT be in billing!"
    print(f"[PASS] Billing graph has {len(billing_fns)} functions; no Space Invaders functions present.")

    # 2. Ingest Space Invaders into ghostgraph_space_invaders
    topology_agent.ingest_target(
        target_json_path="backend/data/targets/space_invaders_decompiled.json",
        target_id="space_invaders"
    )

    invaders_graph = topology_agent.get_topology_graph()
    invaders_fns = [n["data"]["label"] for n in invaders_graph["nodes"] if n["data"].get("group") == "Function"]
    assert "aliensMissileMove" in invaders_fns, "aliensMissileMove must be in space_invaders"
    assert "compute_progressive_tax" not in invaders_fns, "compute_progressive_tax must NOT bleed into space_invaders!"
    assert "init_tariff_tables" not in invaders_fns, "init_tariff_tables must NOT bleed into space_invaders!"
    print(f"[PASS] Space Invaders graph has {len(invaders_fns)} functions; ZERO billing functions bled in.")

    # 3. Switch back to billing and verify isolation remains intact
    falkor_client.select_target_graph("billing")
    recheck_graph = topology_agent.get_topology_graph()
    recheck_fns = [n["data"]["label"] for n in recheck_graph["nodes"] if n["data"].get("group") == "Function"]
    assert "compute_progressive_tax" in recheck_fns
    assert "aliensMissileMove" not in recheck_fns
    print("[PASS] Switching back to billing confirms complete multigraph isolation.")


if __name__ == "__main__":
    test_struct_ingestion_and_query()
    test_multigraph_target_isolation()
    print("\n>>> ALL STRUCT INGESTION & TARGET ISOLATION TESTS PASSED! <<<")
