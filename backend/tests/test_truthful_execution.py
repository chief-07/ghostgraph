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

    print("\n>>> ALL TESTS PASSED: Truthful execution verified! <<<")

if __name__ == "__main__":
    test_truthful_candidate_execution()
