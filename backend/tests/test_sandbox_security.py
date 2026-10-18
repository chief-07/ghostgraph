"""
Tests for Problem 8 & Problem 9:
- Problem 8: Elimination of in-process exec() from API server runtime.
- Problem 9: Subprocess Sandbox Environment Sanitization & Secret Isolation.
"""

import os
import re
import pytest
from backend.harness.sandbox import (
    build_sanitized_sandbox_env,
    validate_candidate_syntax,
    run_sandboxed_evaluation,
    run_sandboxed_step
)


def test_zero_exec_in_app_py():
    """Verifies that backend/app.py contains zero live calls to exec() using Python AST parsing."""
    import ast
    app_py_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))
    with open(app_py_path, "r", encoding="utf-8") as f:
        source = f.read()

    tree = ast.parse(source, filename=app_py_path)
    exec_calls = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == "exec":
                exec_calls.append(node.lineno)

    assert len(exec_calls) == 0, f"Found unallowed exec() AST call node at lines: {exec_calls}"


def test_sandbox_env_sanitization_strips_secrets():
    """
    Problem 9: Verifies that build_sanitized_sandbox_env() thoroughly scrubs
    database passwords, Gemini API keys, AWS credentials, and authorization tokens.
    """
    # Temporarily set sensitive environment variables
    test_secrets = {
        "FALKORDB_PASSWORD": "super_secret_db_password",
        "GEMINI_API_KEY": "AIzaSySecretGeminiKey12345",
        "AWS_SECRET_ACCESS_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "GITHUB_TOKEN": "ghp_secrettoken9999",
        "CUSTOM_PRIVATE_KEY": "my_private_pem_data"
    }
    for k, v in test_secrets.items():
        os.environ[k] = v

    try:
        sanitized = build_sanitized_sandbox_env()

        # None of the sensitive keys should appear in the sanitized environment
        for k in test_secrets:
            assert k not in sanitized, f"Secret key {k} was leaked to sandbox env!"

        # Ensure safe system variables remain intact so Python runtime functions
        assert "PATH" in sanitized or "Path" in sanitized or "SystemRoot" in sanitized
        assert sanitized.get("FALKORDB_OFFLINE") == "1"
        assert sanitized.get("GHOSTGRAPH_SANDBOX_ISOLATED") == "1"
    finally:
        for k in test_secrets:
            os.environ.pop(k, None)


def test_candidate_cannot_access_host_secrets_in_sandbox():
    """
    Problem 9 End-to-End: Untrusted candidate code attempting to read os.environ['GEMINI_API_KEY']
    must find it is completely absent inside the running sandbox process.
    """
    os.environ["GEMINI_API_KEY"] = "AIzaSyCandidateExfiltrationTarget"

    # Candidate code that inspects os.environ and records whether GEMINI_API_KEY is found
    candidate_code = """
import os

def compute_progressive_tax(income):
    # Attempt to exfiltrate secret
    has_gemini = "GEMINI_API_KEY" in os.environ
    if has_gemini:
        # Exfiltration succeeded (bad) -> return -9999
        return -9999
    # Secret was properly shielded (good) -> return legitimate calculation
    return income * 0.10
"""
    test_vectors = [
        {"id": "TC_LEAK_CHECK", "name": "Secret Leak Check", "description": "Ensure no leaked credentials", "income": 1000.0, "expected_tax": 100.0}
    ]

    try:
        res = run_sandboxed_evaluation(
            candidate_code=candidate_code,
            target_name="billing",
            test_vectors=test_vectors,
            has_graph_memory=True,
            timeout=4.0
        )
        assert res.get("status") in ("COMPLETE", "SUCCESS")
        # Parity evaluation runs evaluate_billing_test on TC_LEAK_CHECK
        results = res.get("results", [])
        assert len(results) == 1
        # Passed indicates compute_progressive_tax returned 100.0 (and didn't find GEMINI_API_KEY)
        assert results[0].get("passed") is True
    finally:
        os.environ.pop("GEMINI_API_KEY", None)


def test_validate_candidate_syntax_static_ast():
    """Verifies that syntax validation parses AST safely without code execution."""
    valid_code = "def add(a, b):\n    return a + b\n"
    is_valid, err = validate_candidate_syntax(valid_code)
    assert is_valid is True
    assert err is None

    broken_code = "def broken(a, b\n    return a +"
    is_broken, err = validate_candidate_syntax(broken_code)
    assert is_broken is False
    assert "SyntaxError" in err


def test_sandbox_timeout_guard_kills_infinite_loop():
    """Verifies that infinite loops are killed within the strict timeout guard."""
    infinite_loop_code = """
def compute_progressive_tax(income):
    while True:
        pass
    return income
"""
    test_vectors = [{
        "id": "TC_01",
        "name": "Hang Test",
        "account_id": 101,
        "customer_tier": 1,
        "expected": {"taxable_amount": 500.0, "tax_amount": 50.0}
    }]
    res = run_sandboxed_evaluation(
        candidate_code=infinite_loop_code,
        target_name="billing",
        test_vectors=test_vectors,
        timeout=1.5
    )
    assert res.get("status") == "TIMEOUT"
    assert "Execution Timeout" in res.get("error", "")
