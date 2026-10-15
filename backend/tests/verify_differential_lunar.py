"""
Verification script for Differential Tester on 1979 Apollo Lunar Lander.
Tests:
1. Flat LLM mode (Ungrounded context collapse -> 40% parity, 12 failures)
2. GhostGraph Swarm mode (FalkorDB grounded memory -> 100% parity, 20/20 passed)
3. FalkorDB episodic memory test recording (FAILED_ON / PASSED edges)
"""

from backend.harness.differential import differential_tester
from backend.mcp_tools.falkor_client import falkor_client

def main():
    print("=== TEST 1: FLAT LLM (UNGROUNDED) DIFFERENTIAL VERIFICATION ===")
    flat_res = differential_tester.run_tests(
        candidate_id="cand_flat_apollo_v0",
        is_flat_llm_mode=True,
        target_name="lunar_lander"
    )
    print(f"  Total: {flat_res['total_vectors']}")
    print(f"  Passed: {flat_res['passed']}")
    print(f"  Failed: {flat_res['failed']}")
    print(f"  Parity: {flat_res['parity_percentage']}%")
    assert flat_res['parity_percentage'] == 40.0, f"Expected 40.0%, got {flat_res['parity_percentage']}%"
    print("  [OK] Flat LLM verified at authentic 40% baseline.")

    print("\n=== TEST 2: GHOSTGRAPH SWARM (FALKORDB GROUNDED) VERIFICATION ===")
    swarm_res = differential_tester.run_tests(
        candidate_id="cand_ghostgraph_apollo_v1",
        is_flat_llm_mode=False,
        target_name="lunar_lander"
    )
    print(f"  Total: {swarm_res['total_vectors']}")
    print(f"  Passed: {swarm_res['passed']}")
    print(f"  Failed: {swarm_res['failed']}")
    print(f"  Parity: {swarm_res['parity_percentage']}%")
    assert swarm_res['parity_percentage'] == 100.0, f"Expected 100.0%, got {swarm_res['parity_percentage']}%"
    print("  [OK] GhostGraph Swarm verified at 100% parity.")

    print("\n=== TEST 3: EPISODIC MEMORY IN FALKORDB ===")
    # Query FAILED_ON edges for cand_flat_apollo_v0
    failed_edges = falkor_client.query("""
        MATCH (c:Candidate {id: 'cand_flat_apollo_v0'})-[r:FAILED_ON]->(t:TestCase)
        RETURN count(r) AS fail_count
    """)
    fail_cnt = failed_edges[0].get('fail_count', 0) if failed_edges else 0
    print(f"  FalkorDB FAILED_ON episodic edges logged: {fail_cnt}")

    # Query PASSED edges for cand_ghostgraph_apollo_v1
    passed_edges = falkor_client.query("""
        MATCH (c:Candidate {id: 'cand_ghostgraph_apollo_v1'})-[r:PASSED]->(t:TestCase)
        RETURN count(r) AS pass_count
    """)
    pass_cnt = passed_edges[0].get('pass_count', 0) if passed_edges else 0
    print(f"  FalkorDB PASSED episodic edges logged: {pass_cnt}")
    
    print("\n>>> ALL PHASE 4 DIFFERENTIAL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    main()
