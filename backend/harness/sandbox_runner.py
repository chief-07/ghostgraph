"""
GhostGraph Isolated Sandbox Worker Process (Problem 8).
Executes candidate code inside an isolated child process with strict memory/scope isolation.
Communicates via JSON stdin/stdout.
"""

import sys
import os
import json
import math
import re
from typing import Any, Callable, Dict, List, Optional

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"status": "ERROR", "error": "Empty stdin payload"}))
            return

        payload = json.loads(raw_input)
        candidate_code = payload.get("candidate_code", "")
        target_name = payload.get("target_name", "billing")
        test_vectors = payload.get("test_vectors", [])
        has_graph_memory = payload.get("has_graph_memory", True)

        from backend.harness.differential import (
            evaluate_billing_test,
            evaluate_lunar_lander_test,
            evaluate_space_invaders_test
        )

        candidate_callable = None
        compilation_error = None
        local_scope = {"math": math}

        if candidate_code:
            try:
                cleaned_code = candidate_code
                if "```" in cleaned_code:
                    m = re.search(r"```(?:python)?\s*([\s\S]*?)```", cleaned_code)
                    if m:
                        cleaned_code = m.group(1)

                compiled = compile(cleaned_code, "<sandboxed_candidate>", "exec")
                exec(compiled, local_scope)

                target_fn_names = {
                    "billing": ["compute_progressive_tax", "process_invoice"],
                    "lunar_lander": ["THROTTLE_CONTROL_ROUTINES", "calculate_throttle", "update_newtonian_physics", "apply_thrust_vector"],
                    "space_invaders": ["aliensMissileMove", "aliens_missile_move", "handle_missiles"]
                }
                candidates_to_try = target_fn_names.get(target_name, ["compute_progressive_tax"])
                for fn_name in candidates_to_try:
                    for k, v in local_scope.items():
                        if callable(v) and (k == fn_name or fn_name.lower() in k.lower()):
                            candidate_callable = v
                            break
                    if candidate_callable:
                        break

                if not candidate_callable:
                    user_funcs = [v for k, v in local_scope.items() if callable(v) and not k.startswith("__")]
                    if user_funcs:
                        candidate_callable = user_funcs[0]
                    else:
                        compilation_error = "No executable candidate function found in synthesized code"
            except Exception as e:
                compilation_error = f"{type(e).__name__}: {e}"

        results = []
        for idx, tc in enumerate(test_vectors):
            tid = tc.get("id", f"TC_{idx+1:02d}")
            name = tc.get("name", tid)
            desc = tc.get("description", "")
            cat = tc.get("category", "General")

            passed = False
            diff = ""

            try:
                if target_name == "billing":
                    passed, diff = evaluate_billing_test(tc, candidate_callable, compilation_error, has_graph_memory)
                elif target_name == "lunar_lander":
                    passed, diff = evaluate_lunar_lander_test(
                        tc=tc,
                        has_graph_memory=has_graph_memory,
                        candidate_callable=candidate_callable,
                        compilation_error=compilation_error,
                        candidate_scope=local_scope
                    )
                elif target_name == "space_invaders":
                    passed, diff = evaluate_space_invaders_test(tc, has_graph_memory, candidate_callable, compilation_error)
                else:
                    passed, diff = evaluate_billing_test(tc, candidate_callable, compilation_error, has_graph_memory)
            except Exception as e:
                passed = False
                diff = f"Runtime Exception in test {tid}: {type(e).__name__}: {e}"

            results.append({
                "id": tid,
                "name": name,
                "description": desc,
                "category": cat,
                "passed": passed,
                "diff": diff
            })

        output = {
            "status": "SUCCESS" if not compilation_error else "COMPILATION_ERROR",
            "compilation_error": compilation_error,
            "results": results
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({
            "status": "RUNNER_FATAL_ERROR",
            "error": f"{type(e).__name__}: {e}",
            "results": []
        }))


if __name__ == "__main__":
    main()
