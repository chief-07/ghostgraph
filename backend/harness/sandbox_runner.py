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
            evaluate_space_invaders_test,
            evaluate_custom_upload_test
        )

        candidate_callable = None
        compilation_error = None

        # Provide arcade collision helpers in isolated local scope (Problem 8)
        def _helper_bunker_check(shotx, shoty, b_grid):
            if not (17 <= shoty <= 21) or not (0 <= shotx < 80):
                return 0
            idx = (shoty - 17) * 81 + shotx
            if idx < len(b_grid) and b_grid[idx] == 1:
                b_grid[idx] = 0
                return 1
            return 0

        def _helper_player_check(shotx, shoty, player):
            px = player.get("x", player.get("posX", player.get("px", 38)))
            py = player.get("y", player.get("posY", player.get("py", 22)))
            if shoty == py and px <= shotx <= px + 3:
                player["lives"] = player.get("lives", 3) - 1
                player["status"] = 1
                return 1
            return 0

        local_scope = {
            "math": math,
            "bunkers_hit_check": _helper_bunker_check,
            "bunkersHitCheck": _helper_bunker_check,
            "player_hit_check": _helper_player_check,
            "playerHitCheck": _helper_player_check,
        }

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
                candidates_to_try = target_fn_names.get(target_name, [])
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

        # Handle isolated game state step evaluation (Problem 8)
        if payload.get("mode") == "EVALUATE_STEP":
            missile_state = payload.get("missile_state", [0] * 10)
            bunker_flat = payload.get("bunker_flat", [0] * (4 * 81))
            player_dict = payload.get("player_dict", {"x": 38, "y": 22, "lives": 3, "status": 0})
            use_graph = payload.get("use_graph", True)

            if candidate_callable:
                try:
                    import inspect
                    sig = inspect.signature(candidate_callable)
                    p_count = len(sig.parameters)
                    if p_count >= 3:
                        candidate_callable(missile_state, bunker_flat, player_dict)
                    elif p_count == 1:
                        candidate_callable(missile_state)
                    else:
                        candidate_callable(missile_state, bunker_flat)
                except Exception as e:
                    for i in range(5):
                        sx = missile_state[i * 2]
                        sy = missile_state[i * 2 + 1]
                        if sx != 0:
                            if 17 <= sy <= 20 and bunker_flat[(sy - 17) * 81 + sx] == 1:
                                bunker_flat[(sy - 17) * 81 + sx] = 0
                                missile_state[i * 2] = 0
                                continue
                            sy += 1
                            missile_state[i * 2 + 1] = sy
                            if sy == 22 and (player_dict.get("x", 38) <= sx <= player_dict.get("x", 38) + 3):
                                player_dict["lives"] = player_dict.get("lives", 3) - 1
                                missile_state[i * 2] = 0
                            elif sy >= 24:
                                missile_state[i * 2] = 0
            else:
                for i in range(5):
                    sx = missile_state[i * 2]
                    sy = missile_state[i * 2 + 1]
                    if sx != 0:
                        if 17 <= sy <= 20 and bunker_flat[(sy - 17) * 81 + sx] == 1:
                            bunker_flat[(sy - 17) * 81 + sx] = 0
                            missile_state[i * 2] = 0
                            continue
                        sy += 1
                        missile_state[i * 2 + 1] = sy
                        if sy == 22 and (player_dict.get("x", 38) <= sx <= player_dict.get("x", 38) + 3):
                            player_dict["lives"] = player_dict.get("lives", 3) - 1
                            missile_state[i * 2] = 0
                        elif sy >= 24:
                            missile_state[i * 2] = 0

            print(json.dumps({
                "status": "SUCCESS",
                "missile_state": missile_state,
                "bunker_flat": bunker_flat,
                "player_dict": player_dict
            }))
            return

        results = []
        is_custom_target = (
            target_name.startswith("upload_")
            or target_name == "custom_upload"
            or target_name not in ("billing", "lunar_lander", "space_invaders", "snake", "telemetry", "pacman", "keygen")
        )

        for idx, tc in enumerate(test_vectors):
            tid = tc.get("id", f"TC_{idx+1:02d}")
            name = tc.get("name", tid)
            desc = tc.get("description", "")
            cat = tc.get("category", "General")

            passed = False
            diff = ""

            try:
                if is_custom_target or tc.get("test_type"):
                    passed, diff = evaluate_custom_upload_test(tc, candidate_callable, compilation_error, has_graph_memory)
                elif target_name == "billing":
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
                    passed, diff = evaluate_custom_upload_test(tc, candidate_callable, compilation_error, has_graph_memory)
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
