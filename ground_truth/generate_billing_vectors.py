"""
Generates 20 deterministic test vectors for the Commercial Billing & Tariff Engine.
Matches the ground truth C logic in billing_engine.c exactly.
"""

import json
import math
from typing import List, Dict, Any

TAX_BRACKET_TABLE = [
    (100.00, 0.00),
    (500.00, 0.05),
    (2000.00, 0.12),
    (1e12, 0.20)
]

CUSTOMER_TIER_TABLE = [
    {"tier_id": 0, "base_discount": 0.00, "volume_multiplier": 1.00},
    {"tier_id": 1, "base_discount": 0.03, "volume_multiplier": 1.25},
    {"tier_id": 2, "base_discount": 0.07, "volume_multiplier": 1.50},
    {"tier_id": 3, "base_discount": 0.15, "volume_multiplier": 2.00}
]

def apply_bankers_rounding(val: float) -> float:
    scaled = val * 100.0
    floor_val = math.floor(scaled)
    diff = scaled - floor_val
    if abs(diff - 0.5) < 1e-9:
        floor_int = int(floor_val)
        if floor_int % 2 == 0:
            result = floor_val
        else:
            result = floor_val + 1.0
    else:
        result = round(scaled)
    return result / 100.0

def compute_line_subtotal(quantity: int, unit_price: float) -> float:
    if quantity <= 0 or unit_price < 0.0:
        return 0.0
    tot = float(quantity) * unit_price
    if quantity >= 100:
        tot *= 0.95  # 5% bulk rebate
    return tot

def compute_progressive_tax(taxable: float) -> float:
    if taxable <= 0.0:
        return 0.0
    tot_tax = 0.0
    prev_threshold = 0.0
    for threshold, rate in TAX_BRACKET_TABLE:
        if taxable > prev_threshold:
            in_bracket = min(taxable, threshold) - prev_threshold
            tot_tax += in_bracket * rate
        else:
            break
        prev_threshold = threshold
    return tot_tax

def process_invoice(account_id: int, customer_tier: int, items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if account_id == 0 or account_id > 9999999 or customer_tier < 0 or customer_tier > 3:
        return {"status_code": -1, "gross": 0.0, "loyalty_discount": 0.0, "taxable": 0.0, "tax": 0.0, "total": 0.0}

    gross = 0.0
    taxable_gross = 0.0
    total_units = 0

    for it in items[:8]:
        lt = compute_line_subtotal(it["quantity"], it["unit_price"])
        gross += lt
        total_units += it["quantity"]
        if not it.get("is_tax_exempt", 0):
            taxable_gross += lt

    tier_cfg = CUSTOMER_TIER_TABLE[customer_tier]
    discount_rate = tier_cfg["base_discount"]
    if total_units >= 500:
        discount_rate *= tier_cfg["volume_multiplier"]
    discount_rate = min(discount_rate, 0.30)

    loyalty_discount = gross * discount_rate
    net_subtotal = gross - loyalty_discount

    taxable_net = taxable_gross
    if gross > 0.0:
        taxable_net = taxable_gross * (1.0 - discount_rate)

    raw_tax = compute_progressive_tax(taxable_net)
    rounded_tax = apply_bankers_rounding(raw_tax)
    final_total = apply_bankers_rounding(net_subtotal + rounded_tax)

    return {
        "status_code": 1,
        "gross_subtotal": apply_bankers_rounding(gross),
        "loyalty_discount": apply_bankers_rounding(loyalty_discount),
        "taxable_amount": apply_bankers_rounding(taxable_net),
        "tax_amount": rounded_tax,
        "final_total": final_total
    }

def main():
    scenarios = [
        ("TC_01", "Standard Tier Flat Order", "Basic single item under $100 tax-free allowance", 10001, 0, [{"item_id": 1, "quantity": 2, "unit_price": 40.0, "is_tax_exempt": 0}]),
        ("TC_02", "Tax Bracket 1 Crossing ($100-$500)", "Exercises 5% marginal tax bracket above $100", 10002, 0, [{"item_id": 1, "quantity": 10, "unit_price": 30.0, "is_tax_exempt": 0}]),
        ("TC_03", "Tax Bracket 2 Crossing ($500-$2000)", "Exercises 12% marginal tax bracket with Silver tier", 10003, 1, [{"item_id": 2, "quantity": 10, "unit_price": 100.0, "is_tax_exempt": 0}]),
        ("TC_04", "High-Bracket Luxury Tax (>$2000)", "Exercises 20% high-bracket tax rate", 10004, 2, [{"item_id": 3, "quantity": 5, "unit_price": 600.0, "is_tax_exempt": 0}]),
        ("TC_05", "Bulk Order Quantity Rebate (>=100 units)", "Exercises 5% line item bulk discount trigger", 10005, 1, [{"item_id": 10, "quantity": 120, "unit_price": 10.0, "is_tax_exempt": 0}]),
        ("TC_06", "Enterprise Loyalty Tier Max Boost (500+ units)", "Triggers Enterprise 2.0x volume multiplier", 10006, 3, [{"item_id": 12, "quantity": 600, "unit_price": 8.0, "is_tax_exempt": 0}]),
        ("TC_07", "Banker's Rounding Half-Cent Even Test", "Critical IEEE 754 round-half-to-even half cent verification", 10007, 1, [{"item_id": 15, "quantity": 1, "unit_price": 149.255, "is_tax_exempt": 1}]),
        ("TC_08", "Banker's Rounding Half-Cent Odd Test", "Rounds half-cent to nearest even number", 10008, 1, [{"item_id": 16, "quantity": 1, "unit_price": 149.265, "is_tax_exempt": 1}]),
        ("TC_09", "100% Tax Exempt Commercial Order", "All line items tax exempt (0 tax payable)", 10009, 2, [{"item_id": 20, "quantity": 20, "unit_price": 50.0, "is_tax_exempt": 1}]),
        ("TC_10", "Mixed Taxable and Exempt Basket", "Computes proportional discount against taxable line items", 10010, 2, [
            {"item_id": 21, "quantity": 10, "unit_price": 40.0, "is_tax_exempt": 0},
            {"item_id": 22, "quantity": 10, "unit_price": 60.0, "is_tax_exempt": 1}
        ]),
        ("TC_11", "Exact Lower Bracket Boundary ($100.00)", "Tests boundary precision where tax switches from 0% to 5%", 10011, 0, [{"item_id": 25, "quantity": 1, "unit_price": 100.0, "is_tax_exempt": 0}]),
        ("TC_12", "Exact Mid Bracket Boundary ($500.00)", "Tests boundary where marginal tax switches from 5% to 12%", 10012, 0, [{"item_id": 26, "quantity": 5, "unit_price": 100.0, "is_tax_exempt": 0}]),
        ("TC_13", "Exact High Bracket Boundary ($2000.00)", "Tests boundary where marginal tax switches from 12% to 20%", 10013, 0, [{"item_id": 27, "quantity": 20, "unit_price": 100.0, "is_tax_exempt": 0}]),
        ("TC_14", "Invalid Account ID Failure Check", "Rejects account_id = 0 with status -1", 0, 1, [{"item_id": 1, "quantity": 5, "unit_price": 10.0, "is_tax_exempt": 0}]),
        ("TC_15", "Invalid Tier Index Out-of-Bounds Check", "Rejects customer_tier = 5 with status -1", 10015, 5, [{"item_id": 1, "quantity": 5, "unit_price": 10.0, "is_tax_exempt": 0}]),
        ("TC_16", "Multi-Item Enterprise Full Stack Settlement", "Computes 5 line items across multiple tiers and tax classes", 10016, 3, [
            {"item_id": 31, "quantity": 150, "unit_price": 25.0, "is_tax_exempt": 0},
            {"item_id": 32, "quantity": 200, "unit_price": 15.0, "is_tax_exempt": 0},
            {"item_id": 33, "quantity": 50, "unit_price": 100.0, "is_tax_exempt": 1},
            {"item_id": 34, "quantity": 100, "unit_price": 45.0, "is_tax_exempt": 0}
        ]),
        ("TC_17", "Zero Quantity Line Item Handling", "Safely ignores line items with zero quantity", 10017, 1, [
            {"item_id": 40, "quantity": 0, "unit_price": 500.0, "is_tax_exempt": 0},
            {"item_id": 41, "quantity": 10, "unit_price": 20.0, "is_tax_exempt": 0}
        ]),
        ("TC_18", "Loyalty Discount Cap Clamping (30%)", "Ensures extreme volume discounts are capped at 30%", 10018, 3, [{"item_id": 50, "quantity": 800, "unit_price": 50.0, "is_tax_exempt": 0}]),
        ("TC_19", "Fractional Cent Tax Accumulation", "Precision verification of multi-tier tax fractional accumulation", 10019, 1, [{"item_id": 60, "quantity": 33, "unit_price": 33.33, "is_tax_exempt": 0}]),
        ("TC_20", "End-to-End Golden Settlement Vector", "Reference golden corporate settlement vector matching reference binary", 10020, 2, [
            {"item_id": 71, "quantity": 10, "unit_price": 45.0, "is_tax_exempt": 0},
            {"item_id": 72, "quantity": 5, "unit_price": 120.0, "is_tax_exempt": 0}
        ])
    ]

    vectors = []
    for test_id, name, desc, acc, tier, items in scenarios:
        res = process_invoice(acc, tier, items)
        vectors.append({
            "id": test_id,
            "name": name,
            "description": desc,
            "account_id": acc,
            "customer_tier": tier,
            "items": items,
            "expected": res
        })

    with open("ground_truth/billing_test_vectors.json", "w") as f:
        json.dump(vectors, f, indent=2)

    print(f"Successfully generated 20 deterministic test vectors in ground_truth/billing_test_vectors.json")

if __name__ == "__main__":
    main()
