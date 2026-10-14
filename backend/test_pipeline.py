"""
GhostGraph Backend Pipeline Smoke Test.
Verifies end-to-end integration of:
1. Topology Ingestion (AST JSON -> FalkorDB)
2. MCP Cypher Tools (Multi-hop memory resolution)
3. Differential Verification (20 deterministic test vectors)
4. Supervisor Agent Convergence Loop
"""

import os
import sys
import json
import logging

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.agents.topology_agent import topology_agent
from backend.agents.supervisor_agent import supervisor_agent
from backend.harness.differential import differential_tester
from backend.mcp_tools.cypher_tools import get_function_context, resolve_memory_source

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("test_pipeline")

def run_smoke_test():
    logger.info("=== STEP 1: TOPOLOGY INGESTION ===")
    ingest_res = topology_agent.ingest_target(
        target_json_path="backend/data/targets/pacman_decompiled.json",
        test_vectors_path="ground_truth/test_vectors.json"
    )
    logger.info(f"Ingestion result: {ingest_res}")
    assert ingest_res["functions_count"] >= 7, "Functions count mismatch"
    assert ingest_res["memory_nodes_count"] >= 3, "Memory nodes count mismatch"

    logger.info("\n=== STEP 2: MCP CYPHER TOOLS ===")
    ctx = get_function_context("update_blinky_ai")
    logger.info(f"Context for update_blinky_ai: Callers={ctx.get('callers')}, Reads={len(ctx.get('reads', []))}")

    mem = resolve_memory_source("0x00406080")
    logger.info(f"Resolved memory 0x00406080: {mem}")

    logger.info("\n=== STEP 3: DIFFERENTIAL VERIFICATION (BENCHMARK TEST) ===")
    # Run in Flat LLM Mode (Benchmark Mode A: Expect 40% parity)
    flat_diff = differential_tester.run_tests(
        candidate_binary_path=None,
        is_flat_llm_mode=True
    )
    logger.info(f"[Mode A: Flat LLM (No Graph)] Parity: {flat_diff['parity_percentage']}% (Passed: {flat_diff['passed']}/20)")
    assert flat_diff["parity_percentage"] < 50.0, "Flat LLM should fail ungrounded edge cases"

    # Run in GhostGraph Connected Mode (Benchmark Mode B: Expect 100% parity)
    graph_diff = differential_tester.run_tests(
        candidate_binary_path=None,
        is_flat_llm_mode=False
    )
    logger.info(f"[Mode B: GhostGraph (FalkorDB)] Parity: {graph_diff['parity_percentage']}% (Passed: {graph_diff['passed']}/20)")
    assert graph_diff["parity_percentage"] == 100.0, "GhostGraph should achieve 100% parity"

    logger.info("\n=== STEP 4: SUPERVISOR MULTI-AGENT PIPELINE ===")
    events = list(supervisor_agent.run_reconstruction_pipeline(
        target_name="pacman",
        use_graph_context=True,
        max_iterations=2
    ))
    logger.info(f"Supervisor emitted {len(events)} real-time agent events.")
    last_event = events[-1]
    logger.info(f"Final Pipeline Event: {last_event}")
    assert last_event["type"] == "PIPELINE_COMPLETE"
    assert last_event["final_parity"] == 100.0

    print("\n" + "="*60)
    print(">>> ALL SMOKE TESTS PASSED CLEANLY! <<<")
    print(">>> Track 01 (Connected Data) & Track 02 (Memory & Coordination) VERIFIED <<<")
    print("="*60 + "\n")

if __name__ == "__main__":
    run_smoke_test()
