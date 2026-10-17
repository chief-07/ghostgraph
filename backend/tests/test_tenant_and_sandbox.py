"""
Unit tests verifying Problem 7 (Multi-Tenant / Session Isolation) and Problem 8 (Sandboxed Code Execution).
Proves that:
1. falkor_client.for_tenant() maintains strict multigraph tenant isolation without mutating the global singleton client.
2. Independent tenant sessions do not bleed memory, nodes, or queries into each other.
3. Candidate execution is sandboxed in an isolated subprocess with a strict 3.0-second timeout guard.
4. Infinite loop candidates (while True:) are terminated cleanly without hanging the test suite or server.
"""

import sys
import os
import time
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.mcp_tools.falkor_client import falkor_client
from backend.harness.differential import differential_tester
from backend.harness.sandbox import run_sandboxed_evaluation


def test_tenant_session_multigraph_isolation():
    """Verify Problem 7: Tenant sessions maintain separate graphs without mutating global singleton state."""
    # 1. Capture initial global singleton state
    initial_graph = falkor_client.graph_name

    # 2. Create two independent tenant sessions
    tenant_a = falkor_client.for_tenant("tenant_alpha_test")
    tenant_b = falkor_client.for_tenant("tenant_beta_test")

    assert tenant_a.graph_name == "ghostgraph_tenant_alpha_test"
    assert tenant_b.graph_name == "ghostgraph_tenant_beta_test"
    assert falkor_client.graph_name == initial_graph, "Singleton graph_name must not be mutated"

    # 3. Clear and write isolated node to Tenant A
    tenant_a.query("MATCH (n) DETACH DELETE n")
    tenant_a.query("CREATE (f:Function {name: 'alpha_secret_subroutine'})")

    # 4. Clear and write isolated node to Tenant B
    tenant_b.query("MATCH (n) DETACH DELETE n")
    tenant_b.query("CREATE (f:Function {name: 'beta_secret_subroutine'})")

    # 5. Verify Tenant A sees ONLY alpha_secret
    res_a = tenant_a.query("MATCH (f:Function) RETURN f.name AS name")
    names_a = [r["name"] for r in res_a]
    assert "alpha_secret_subroutine" in names_a
    assert "beta_secret_subroutine" not in names_a, "Tenant B nodes must not bleed into Tenant A!"

    # 6. Verify Tenant B sees ONLY beta_secret
    res_b = tenant_b.query("MATCH (f:Function) RETURN f.name AS name")
    names_b = [r["name"] for r in res_b]
    assert "beta_secret_subroutine" in names_b
    assert "alpha_secret_subroutine" not in names_b, "Tenant A nodes must not bleed into Tenant B!"

    # 7. Verify global singleton default was never mutated
    assert falkor_client.graph_name == initial_graph, "Global singleton must remain completely unmutated!"

    # Clean up test tenant graphs
    tenant_a.clear_graph()
    tenant_b.clear_graph()


def test_sandboxed_candidate_valid_execution():
    """Verify Problem 8: Valid candidate code executes successfully inside the subprocess sandbox."""
    valid_code = """
def compute_progressive_tax(taxable_amount):
    if taxable_amount <= 0.0:
        return 0.0
    brackets = [(100.0, 0.0), (500.0, 0.05), (2000.0, 0.12), (1e12, 0.20)]
    total_tax = 0.0
    prev = 0.0
    for threshold, rate in brackets:
        if taxable_amount > prev:
            in_bracket = min(taxable_amount, threshold) - prev
            total_tax += in_bracket * rate
        else:
            break
        prev = threshold
    return round(total_tax, 2)
"""
    summary = differential_tester.run_tests(
        target_name="billing",
        candidate_code=valid_code,
        is_flat_llm_mode=False
    )

    assert summary["parity_percentage"] == 100.0
    assert summary["passed"] == 20
    assert summary["failed"] == 0


def test_sandboxed_candidate_infinite_loop_timeout_guard():
    """Verify Problem 8: Infinite loop candidate is killed cleanly at 3.0s without hanging the backend."""
    infinite_loop_code = """
def compute_progressive_tax(taxable_amount):
    # Intentional infinite loop simulating runaway / rogue LLM code
    count = 0
    while True:
        count += 1
"""
    start_t = time.perf_counter()
    summary = differential_tester.run_tests(
        target_name="billing",
        candidate_code=infinite_loop_code,
        is_flat_llm_mode=False
    )
    elapsed = time.perf_counter() - start_t

    # Must complete around the timeout limit and not hang indefinitely
    assert elapsed < 8.0, f"Execution took {elapsed:.2f}s; sandbox failed to terminate runaway loop!"
    assert summary["passed"] == 0
    assert summary["failed"] == summary["total_vectors"]
    assert summary["parity_percentage"] == 0.0

    # Verify that timeout failure diff was reported
    first_res = summary["results"][0]
    assert "Execution Timeout" in first_res["diff"]
    assert "sandbox limit" in first_res["diff"]


def test_sandboxed_candidate_syntax_and_crash_isolation():
    """Verify Problem 8: Subprocess crash or syntax error is safely isolated from backend."""
    crashing_code = """
def compute_progressive_tax(taxable_amount):
    raise ZeroDivisionError("Simulated unhandled fatal division error inside candidate")
"""
    summary = differential_tester.run_tests(
        target_name="billing",
        candidate_code=crashing_code,
        is_flat_llm_mode=False
    )

    failed_tests = [r for r in summary["results"] if r.get("status") == "FAILED"]
    assert len(failed_tests) >= 18
    assert "ZeroDivisionError" in failed_tests[0]["diff"]
