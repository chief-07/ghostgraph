"""
GhostGraph Subprocess Sandbox (Problem 8).
Executes candidate verification inside an isolated OS process with a strict 3.0-second timeout guard.
Prevents infinite loops (while True:), CPU freezes, or malicious syntax from blocking the backend.
"""

import sys
import os
import json
import logging
import subprocess
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ghostgraph.sandbox")

DEFAULT_SANDBOX_TIMEOUT_SECONDS = 3.0


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
        "candidate_code": candidate_code,
        "target_name": target_name,
        "test_vectors": test_vectors,
        "has_graph_memory": has_graph_memory
    }
    raw_payload = json.dumps(payload)

    try:
        cmd = [sys.executable, "-m", "backend.harness.sandbox_runner"]
        env = dict(os.environ)
        env["FALKORDB_OFFLINE"] = "1"

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
