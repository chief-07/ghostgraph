"""
GhostGraph Subprocess Sandbox (Problem 8 & Problem 9).
Executes candidate verification inside an isolated OS process with a strict timeout guard.
Prevents infinite loops (while True:), CPU freezes, or malicious syntax from blocking the backend.
Sanitizes environment variables to prevent credential exfiltration (Problem 9).
"""

import sys
import os
import json
import logging
import subprocess
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("ghostgraph.sandbox")

DEFAULT_SANDBOX_TIMEOUT_SECONDS = 5.0


def build_sanitized_sandbox_env() -> Dict[str, str]:
    """
    Problem 9 (Subprocess Sandbox Environment Secret Sanitization):
    Constructs a sanitized, minimal environment for untrusted child process execution.
    Passes strictly necessary OS variables for Python stdlib & DLL resolution (PATH, SYSTEMROOT, TEMP),
    while scrubbing all credentials, API keys (GEMINI_*, FALKORDB_*, OPENAI_*, ANTHROPIC_*), and secrets.
    """
    ALLOWED_SYS_VARS = {
        "PATH", "SYSTEMROOT", "TEMP", "TMP", "PYTHONPATH", "COMSPEC",
        "PATHEXT", "WINDIR", "LANG", "LC_ALL", "USERPROFILE", "LOCALAPPDATA"
    }
    sanitized: Dict[str, str] = {}
    for k, v in os.environ.items():
        if k.upper() in ALLOWED_SYS_VARS:
            sanitized[k] = v

    # Explicit security scrubbing: strip any key containing sensitive patterns
    SENSITIVE_PATTERNS = ("KEY", "SECRET", "PASSWORD", "TOKEN", "AUTH", "CREDENTIAL", "PRIVATE")
    keys_to_purge = [
        k for k in sanitized
        if any(pat in k.upper() for pat in SENSITIVE_PATTERNS)
        or k.upper().startswith(("FALKORDB_", "GEMINI_", "GOOGLE_", "OPENAI_", "ANTHROPIC_"))
    ]
    for k in keys_to_purge:
        sanitized.pop(k, None)

    # Enforce safe offline sandbox mode
    sanitized["FALKORDB_OFFLINE"] = "1"
    sanitized["PYTHONUNBUFFERED"] = "1"
    sanitized["PYTHONDONTWRITEBYTECODE"] = "1"
    sanitized["GHOSTGRAPH_SANDBOX_ISOLATED"] = "1"
    return sanitized


def validate_candidate_syntax(candidate_code: str) -> Tuple[bool, Optional[str]]:
    """
    Static AST validation on synthesized candidate code without executing bytecode.
    Returns (True, None) if valid Python, or (False, error_message) if syntax is invalid.
    """
    import ast
    import re
    cleaned = candidate_code
    if "```" in cleaned:
        m = re.search(r"```(?:python)?\s*([\s\S]*?)```", cleaned)
        if m:
            cleaned = m.group(1)
    try:
        ast.parse(cleaned)
        return True, None
    except SyntaxError as se:
        return False, f"SyntaxError: {se.msg} at line {se.lineno}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def run_sandboxed_step(
    candidate_code: str,
    missile_state: List[int],
    bunker_flat: List[int],
    player_dict: Dict[str, Any],
    use_graph: bool = True,
    timeout: float = 3.0
) -> Dict[str, Any]:
    """
    Problem 8 (API-Process exec() Untrusted Code Execution Elimination):
    Executes live arcade state step inside the isolated child subprocess sandbox rather than in the
    FastAPI server process. Guarded by process timeout and sanitized environment.
    """
    payload = {
        "mode": "EVALUATE_STEP",
        "candidate_code": candidate_code,
        "missile_state": missile_state,
        "bunker_flat": bunker_flat,
        "player_dict": player_dict,
        "use_graph": use_graph
    }
    raw_payload = json.dumps(payload)
    try:
        cmd = [sys.executable, "-m", "backend.harness.sandbox_runner"]
        env = build_sanitized_sandbox_env()
        proc = subprocess.run(
            cmd,
            input=raw_payload,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return json.loads(proc.stdout)
        else:
            return {"status": "ERROR", "error": proc.stderr.strip() or f"Sandbox runner exited with {proc.returncode}"}
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "error": f"Step execution timed out after {timeout}s"}
    except Exception as e:
        return {"status": "FATAL_ERROR", "error": str(e)}


def run_sandboxed_evaluation(
    candidate_code: str,
    target_name: str,
    test_vectors: List[Dict[str, Any]],
    has_graph_memory: bool = True,
    timeout: float = DEFAULT_SANDBOX_TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """
    Executes candidate code inside an isolated child process guarded by a strict timeout.
    If the candidate enters an infinite loop or takes longer than `timeout`, the child process
    is killed immediately and a timeout failure result is returned.
    """
    payload = {
        "mode": "EVALUATE_TESTS",
        "candidate_code": candidate_code,
        "target_name": target_name,
        "test_vectors": test_vectors,
        "has_graph_memory": has_graph_memory
    }
    raw_payload = json.dumps(payload)

    try:
        cmd = [sys.executable, "-m", "backend.harness.sandbox_runner"]
        env = build_sanitized_sandbox_env()

        proc = subprocess.run(
            cmd,
            input=raw_payload,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        )

        if proc.returncode == 0 and proc.stdout.strip():
            try:
                data = json.loads(proc.stdout)
                return data
            except json.JSONDecodeError as jde:
                logger.error(f"Failed to decode sandbox output: {jde}; stdout={proc.stdout[:200]}")
                return {
                    "status": "PARSE_ERROR",
                    "error": f"Invalid JSON returned from sandbox runner: {jde}",
                    "results": [
                        {"id": tc.get("id", f"TC_{i+1:02d}"), "name": tc.get("name", ""), "description": tc.get("description", ""), "category": tc.get("category", ""), "passed": False, "diff": f"Sandbox output decode error: {jde}"}
                        for i, tc in enumerate(test_vectors)
                    ]
                }
        else:
            err_msg = proc.stderr.strip() or f"Process exited with code {proc.returncode}"
            logger.warning(f"Sandbox runner error (exit code {proc.returncode}): {err_msg[:200]}")
            return {
                "status": "RUNNER_ERROR",
                "error": err_msg,
                "results": [
                    {"id": tc.get("id", f"TC_{i+1:02d}"), "name": tc.get("name", ""), "description": tc.get("description", ""), "category": tc.get("category", ""), "passed": False, "diff": f"Sandbox runner error: {err_msg[:120]}"}
                    for i, tc in enumerate(test_vectors)
                ]
            }

    except subprocess.TimeoutExpired:
        logger.warning(f"Candidate execution exceeded {timeout}s execution timeout limit. Process killed.")
        timeout_msg = f"Execution Timeout: Candidate code exceeded {timeout}s sandbox limit (possible infinite loop or hang)"
        return {
            "status": "TIMEOUT",
            "error": timeout_msg,
            "results": [
                {
                    "id": tc.get("id", f"TC_{i+1:02d}"),
                    "name": tc.get("name", ""),
                    "description": tc.get("description", ""),
                    "category": tc.get("category", ""),
                    "passed": False,
                    "diff": timeout_msg
                }
                for i, tc in enumerate(test_vectors)
            ]
        }
    except Exception as e:
        logger.error(f"Sandbox execution fatal error: {e}")
        return {
            "status": "FATAL_ERROR",
            "error": str(e),
            "results": [
                {"id": tc.get("id", f"TC_{i+1:02d}"), "name": tc.get("name", ""), "description": tc.get("description", ""), "category": tc.get("category", ""), "passed": False, "diff": f"Fatal sandbox error: {e}"}
                for i, tc in enumerate(test_vectors)
            ]
        }
