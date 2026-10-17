"""
Unit test verifying Track 02: Agent Memory & Autonomous Multi-Turn Self-Healing Loop.
Proves that:
1. Failed test cases create real FAILED_ON relationships with diff properties in FalkorDB.
2. fetch_failure_memory retrieves observed_error from r.diff (fixing the Cypher property bug).
3. ReconstructionAgent v2 recalls prior failures and injects episodic memory into the prompt.
4. Supervisor multi-turn self-healing loop triggers when v1 has failures and iterates to v2.
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.mcp_tools import cypher_tools
from backend.mcp_tools.falkor_client import falkor_client
from backend.agents.reconstruction_agent import reconstruction_agent
from backend.agents.supervisor_agent import supervisor_agent


def test_cypher_failure_memory_recording_and_retrieval():
    """Verify that r.diff is correctly recorded on FAILED_ON and retrieved as observed_error."""
    cid = "test_cand_v1"
    fn = "compute_tax"
    target = "billing_test"

    # Record candidate
    cypher_tools.record_candidate(
        function_name=fn,
        source_code="def compute_tax(x): return x * 0.1",
        version=1,
        target_name=target,
        candidate_id=cid
    )

    # Record test failure with diff
    diff_msg = "Expected: 42.00, Got: 10.00 (Delta: -32.00)"
    cypher_tools.record_test_outcome(
        candidate_id=cid,
        test_id="TC_01",
        passed=False,
        diff=diff_msg
    )

    # Retrieve failure memory
    memories = cypher_tools.fetch_failure_memory(target_name=target, function_name=fn, candidate_version=1)
    assert len(memories) >= 1, "Expected at least 1 recorded failure memory"
    
    first = memories[0]
    assert first["test_id"] == "TC_01", f"Expected test_id TC_01, got {first.get('test_id')}"
    assert first["observed_error"] == diff_msg, f"Expected observed_error '{diff_msg}', got '{first.get('observed_error')}'"
    print(f"[TEST 1 PASS] Cypher property test passed: observed_error={first['observed_error']}")


def test_reconstruction_agent_recalls_memory():
    """Verify ReconstructionAgent retrieves failure memory on version >= 2 and attaches it."""
    cid = "cand_apollo_v1"
    target = "apollo_dsky"
    fn = "ApolloGuidance_CalculateTrajectory"

    cypher_tools.record_candidate(
        function_name=fn,
        source_code="// candidate code v1",
        version=1,
        target_name=target,
        candidate_id=cid
    )
    cypher_tools.record_test_outcome(
        candidate_id=cid,
        test_id="TC_TRAJ_01",
        passed=False,
        diff="Thrust Vector mismatch: Delta +0.082 rad"
    )

    # When reconstructing v2 with graph context enabled:
    with patch.object(reconstruction_agent, "_call_gemini_api", return_value="def ApolloGuidance_CalculateTrajectory(): pass"):
        recon_result = reconstruction_agent.reconstruct_function(
            function_name=fn,
            target_name=target,
            version=2,
            use_graph_context=True,
            target_language="python"
        )

    assert recon_result["version"] == 2
    assert recon_result.get("recalled_failures_count", 0) >= 1, "ReconstructionAgent must recall >= 1 failure for v2"
    assert "Prior Verified Failures" in recon_result.get("provenance_prompt", ""), "Prompt must contain Prior Verified Failures section"
    print(f"[TEST 2 PASS] ReconstructionAgent v2 successfully recalled {recon_result['recalled_failures_count']} failure memories.")


def test_supervisor_self_healing_loop_triggers():
    """Verify that when Candidate v1 has failures and max_iterations=2, the self-healing loop runs."""
    events = []
    # Run pipeline on 'billing' with max_iterations=2
    # Mocking Gemini call to return broken code first then valid code to verify loop progression
    broken_code = """
def compute_progressive_tax(taxable_amount):
    return round(taxable_amount * 0.10, 2)
"""
    fixed_code = """
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

    def mock_reconstruct(function_name, target_name, version=1, use_graph_context=True, target_language="python"):
        code = broken_code if version == 1 else fixed_code
        recalled = 1 if version > 1 else 0
        return {
            "candidate_id": f"cand_{target_name}_v{version}",
            "version": version,
            "source_code": code,
            "resolved_memory_count": 1,
            "recalled_failures_count": recalled,
            "reasoning": f"Reconstructing version {version}"
        }

    with patch.object(supervisor_agent.reconstructor, "reconstruct_function", side_effect=mock_reconstruct):
        for ev in supervisor_agent.run_reconstruction_pipeline(
            target_name="billing",
            use_graph_context=True,
            max_iterations=2
        ):
            events.append(ev)

    event_types = [e["type"] for e in events]
    assert "PIPELINE_START" in event_types
    assert "CANDIDATE_GENERATED" in event_types
    assert "VERIFICATION_RESULT" in event_types
    
    # Check that EPISODIC_MEMORY_SELF_HEAL event was fired
    self_heal_events = [e for e in events if e.get("action") == "EPISODIC_MEMORY_SELF_HEAL"]
    assert len(self_heal_events) == 1, "Supervisor must fire EPISODIC_MEMORY_SELF_HEAL when v1 fails and max_iterations=2"
    
    # Check that candidate v2 was generated
    cand_v2 = [e for e in events if e["type"] == "CANDIDATE_GENERATED" and e.get("version") == 2]
    assert len(cand_v2) == 1, "Supervisor must generate Candidate v2"

    # Check pipeline complete with 2 iterations
    complete = [e for e in events if e["type"] == "PIPELINE_COMPLETE"][0]
    assert complete["iterations"] == 2
    assert complete["converged"] is True
    assert complete["final_parity"] == 100.0
    print("[TEST 3 PASS] Supervisor self-healing multi-turn loop successfully executed v1 -> memory -> v2 -> 100% parity.")


if __name__ == "__main__":
    test_cypher_failure_memory_recording_and_retrieval()
    test_reconstruction_agent_recalls_memory()
    test_supervisor_self_healing_loop_triggers()
    print("\n>>> ALL TRACK 02 SELF-HEALING MEMORY TESTS PASSED! <<<")
