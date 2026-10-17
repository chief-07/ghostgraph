"""
Unit test verifying truthful candidate execution in DifferentialTester.
Proves that:
1. Broken candidates genuinely fail with real calculation deltas.
2. Grounded candidates genuinely pass by executing real math.
3. Syntax error candidates genuinely fail with 0.0% parity.
"""

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.harness.differential import differential_tester

def test_truthful_candidate_execution():
    # 1. Broken flat tax candidate (guesses 10% flat VAT)
    broken_code = """
def compute_progressive_tax(taxable_amount):
    if taxable_amount <= 0:
        return 0.0
    return round(taxable_amount * 0.10, 2)
"""
    res_broken = differential_tester.run_tests(target_name="billing", candidate_code=broken_code)
    print("--- TEST 1: REAL BROKEN CANDIDATE EXECUTION ---")
    print(f"Parity: {res_broken['parity_percentage']}% (Passed: {res_broken['passed']}/{res_broken['total_vectors']})")
    failures = [r for r in res_broken["results"] if r["status"] == "FAILED"]
    print(f"First failure diff: {failures[0]['diff']}")
    assert res_broken["parity_percentage"] < 50.0, "Broken candidate must fail real execution!"

    # 2. Valid grounded candidate (with FalkorDB progressive bracket memory)
    grounded_code = """
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
    res_grounded = differential_tester.run_tests(target_name="billing", candidate_code=grounded_code)
    print("\n--- TEST 2: REAL GROUNDED CANDIDATE EXECUTION ---")
    print(f"Parity: {res_grounded['parity_percentage']}% (Passed: {res_grounded['passed']}/{res_grounded['total_vectors']})")
    assert res_grounded["parity_percentage"] == 100.0, "Grounded candidate must pass 100%!"

    # 3. Syntax error candidate
    syntax_error_code = "def compute_progressive_tax(taxable_amount): return taxable_amount +"
    res_syntax = differential_tester.run_tests(target_name="billing", candidate_code=syntax_error_code)
    print("\n--- TEST 3: SYNTAX ERROR CANDIDATE ---")
    print(f"Parity: {res_syntax['parity_percentage']}% (Passed: {res_syntax['passed']}/{res_syntax['total_vectors']})")
    print(f"Syntax error message: {res_syntax['results'][0]['diff']}")
    assert res_syntax["parity_percentage"] == 0.0, "Syntax error candidate must score 0.0%!"

    print("\n>>> ALL BILLING TESTS PASSED: Truthful execution verified! <<<")

def test_truthful_lunar_lander_execution():
    # 1. Syntax error candidate on lunar_lander
    syntax_error_code = "def THROTTLE_CONTROL_ROUTINES(desired_accel): return desired_accel +"
    res_syntax = differential_tester.run_tests(target_name="lunar_lander", candidate_code=syntax_error_code)
    print("\n--- TEST 4: LUNAR SYNTAX ERROR CANDIDATE ---")
    print(f"Parity: {res_syntax['parity_percentage']}% (Passed: {res_syntax['passed']}/{res_syntax['total_vectors']})")
    assert res_syntax["parity_percentage"] == 0.0, "Syntax error candidate must score 0.0%!"
    assert "Candidate Compilation/Syntax Error" in res_syntax["results"][0]["diff"]

    # 2. Broken candidate (returns 0 throttle everywhere)
    broken_code = """
def THROTTLE_CONTROL_ROUTINES(desired_accel):
    return 0.0
"""
    res_broken = differential_tester.run_tests(target_name="lunar_lander", candidate_code=broken_code)
    print("\n--- TEST 5: LUNAR BROKEN THROTTLE CANDIDATE ---")
    print(f"Parity: {res_broken['parity_percentage']}% (Passed: {res_broken['passed']}/{res_broken['total_vectors']})")
    assert res_broken["parity_percentage"] == 60.0, "Broken throttle candidate must fail all propulsion/trajectory tests!"
    failed_tests = [r["name"] for r in res_broken["results"] if r["status"] == "FAILED"]
    assert "Hover Equilibrium Threshold" in failed_tests
    assert "Maximum Rate Climb Vector" in failed_tests
    assert "Tsiolkovsky Propellant Depletion Rate" in failed_tests
    assert "Positive Pitch Gimbal Vectoring" in failed_tests
    assert "Negative Pitch Deceleration Vectoring" in failed_tests
    assert "Throttle Table 0x00403000 Non-Linearity" in failed_tests
    assert "Deceleration Burn Trajectory" in failed_tests
    assert "End-to-End Guided Lunar Descent" in failed_tests

    # 3. Grounded candidate (authentic Apollo guidance routine)
    grounded_code = """
def THROTTLE_CONTROL_ROUTINES(desired_accel):
    lowcrit = 0.10
    highcrit = 0.60
    fc = desired_accel * 15103.0
    throttle = fc / 45000.0
    if throttle <= lowcrit:
        return lowcrit
    elif throttle > highcrit:
        return 1.00
    return throttle
"""
    res_grounded = differential_tester.run_tests(target_name="lunar_lander", candidate_code=grounded_code)
    print("\n--- TEST 6: LUNAR GROUNDED APOLLO GUIDANCE CANDIDATE ---")
    print(f"Parity: {res_grounded['parity_percentage']}% (Passed: {res_grounded['passed']}/{res_grounded['total_vectors']})")
    assert res_grounded["parity_percentage"] == 100.0, f"Grounded candidate must achieve 100% parity, got {res_grounded['parity_percentage']}%"

    print("\n>>> ALL LUNAR LANDER TESTS PASSED: Truthful execution verified! <<<")


def test_truthful_space_invaders_execution():
    # 1. Syntax error
    syntax_code = "def aliens_missile_move(missiles): return missiles +"
    res_syntax = differential_tester.run_tests(target_name="space_invaders", candidate_code=syntax_code)
    assert res_syntax["parity_percentage"] == 0.0

    # 2. Broken candidate: freezes missiles in place
    broken_code = """
def aliens_missile_move(missiles, bunker_check=None, player_check=None):
    return 0
"""
    res_broken = differential_tester.run_tests(target_name="space_invaders", candidate_code=broken_code)
    assert res_broken["parity_percentage"] < 30.0

    # 3. Grounded candidate: authentic Space Invaders missile stepping with bunker and player collision
    grounded_code = """
def aliens_missile_move(missiles, bunker_check=None, player_check=None):
    hit = 0
    for i in range(5):
        sx = missiles[i * 2]
        sy = missiles[i * 2 + 1]
        if sx != 0:
            if bunker_check and bunker_check(sx, sy):
                missiles[i * 2] = 0
                continue
            sy += 1
            missiles[i * 2 + 1] = sy
            if player_check and player_check(sx, sy):
                missiles[i * 2] = 0
                hit = 1
            elif sy >= 24:
                missiles[i * 2] = 0
    return hit
"""
    res_grounded = differential_tester.run_tests(target_name="space_invaders", candidate_code=grounded_code)
    assert res_grounded["parity_percentage"] == 100.0, f"Expected 100.0%, got {res_grounded['parity_percentage']}%"
    assert res_grounded["passed"] == 20


if __name__ == "__main__":
    test_truthful_candidate_execution()
    test_truthful_lunar_lander_execution()
    test_truthful_space_invaders_execution()

