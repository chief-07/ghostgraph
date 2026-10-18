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

    # 2. Broken candidate (returns 0 throttle everywhere and lacks subroutines)
    broken_code = """
def THROTTLE_CONTROL_ROUTINES(desired_accel):
    return 0.0
"""
    res_broken = differential_tester.run_tests(target_name="lunar_lander", candidate_code=broken_code)
    print("\n--- TEST 5: LUNAR BROKEN THROTTLE CANDIDATE ---")
    print(f"Parity: {res_broken['parity_percentage']}% (Passed: {res_broken['passed']}/{res_broken['total_vectors']})")
    assert res_broken["parity_percentage"] <= 10.0, f"Broken candidate must fail all candidate-driven tests, got {res_broken['parity_percentage']}%"
    failed_tests = [r["name"] for r in res_broken["results"] if r["status"] == "FAILED"]
    assert "State Register Initialization" in failed_tests
    assert "Hover Equilibrium Threshold" in failed_tests
    assert "Maximum Rate Climb Vector" in failed_tests
    assert "Terrain Raycast: Crater Ridge" in failed_tests
    assert "Apollo Nominal Soft Touchdown" in failed_tests

    # 3. Grounded candidate (authentic Apollo guidance routine with grounded subroutines)
    grounded_code = """
LM_INITIAL_MASS = 15103.0
LOWCRIT = 0.10
HIGHCRIT = 0.60
MAX_DPS_THRUST = 45000.0

LUNAR_TERRAIN = [75.0 - (i * 5.0) if i < 11 else (10.0 if i <= 19 else 10.0 + (i - 19) * 6.25) for i in range(32)]

def THROTTLE_CONTROL_ROUTINES(desired_accel):
    fc = desired_accel * LM_INITIAL_MASS
    effective_throttle = fc / MAX_DPS_THRUST
    if effective_throttle <= LOWCRIT:
        return LOWCRIT
    elif effective_throttle > HIGHCRIT:
        return 1.00
    return effective_throttle

def check_altitude_raycast(x, y):
    dx = 1000.0 / 31.0
    seg = max(0, min(30, int(x / dx)))
    t = (x - (seg * dx)) / dx
    terrain_y = (1.0 - t) * LUNAR_TERRAIN[seg] + t * LUNAR_TERRAIN[seg + 1]
    return y - terrain_y

def evaluate_touchdown(vy, vx, pitch, slope=0.0):
    if abs(vy) > 3.0: return -1
    if abs(vx) > 1.5: return -2
    if abs(pitch) > 0.10: return -3
    if slope > 0.08: return -4
    return 1
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

