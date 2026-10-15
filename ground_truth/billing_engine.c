/**
 * Legacy Commercial Billing & Tariff Engine (Ground Truth C Implementation).
 * 
 * Implements 6 interconnected accounting and tariff calculation subroutines:
 * - sub_00401010: init_tariff_tables
 * - sub_00401080: validate_account_status
 * - sub_00401100: calculate_line_subtotal
 * - sub_00401180: compute_progressive_tax
 * - sub_00401220: apply_bankers_rounding
 * - sub_00401300: process_invoice
 */

#include "billing_engine.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ============================================================================
 * Static Global Memory Tables (Targets for Decompiler Address Analysis)
 * ============================================================================ */

/* Virtual Address: 0x00405000 - Progressive Marginal Tax Brackets */
TaxBracket TAX_BRACKET_TABLE[TAX_BRACKETS_COUNT] = {
    {  100.00, 0.00 },  /* Tier 0: $0 to $100 -> 0% (Tax-free allowance) */
    {  500.00, 0.05 },  /* Tier 1: $100 to $500 -> 5% */
    { 2000.00, 0.12 },  /* Tier 2: $500 to $2000 -> 12% */
    { 1e12,    0.20 }   /* Tier 3: Above $2000 -> 20% high-bracket */
};

/* Virtual Address: 0x00405080 - Customer Loyalty Discount Matrix */
CustomerTierConfig CUSTOMER_TIER_TABLE[CUSTOMER_TIERS_COUNT] = {
    { 0, 0.00, 1.00 },  /* Standard: 0% base discount */
    { 1, 0.03, 1.25 },  /* Silver: 3% base discount, 1.25x volume boost */
    { 2, 0.07, 1.50 },  /* Gold: 7% base discount, 1.50x volume boost */
    { 3, 0.15, 2.00 }   /* Enterprise: 15% base discount, 2.00x volume boost */
};

/* ============================================================================
 * Subroutine Implementations
 * ============================================================================ */

/**
 * sub_00401010: Initialises global tariff tables and discount matrices.
 */
void init_tariff_tables(void) {
    /* Virtual Address 0x00405000: Tax brackets */
    TAX_BRACKET_TABLE[0].threshold = 100.00;
    TAX_BRACKET_TABLE[0].rate = 0.00;

    TAX_BRACKET_TABLE[1].threshold = 500.00;
    TAX_BRACKET_TABLE[1].rate = 0.05;

    TAX_BRACKET_TABLE[2].threshold = 2000.00;
    TAX_BRACKET_TABLE[2].rate = 0.12;

    TAX_BRACKET_TABLE[3].threshold = 1e12;
    TAX_BRACKET_TABLE[3].rate = 0.20;

    /* Virtual Address 0x00405080: Customer tiers */
    CUSTOMER_TIER_TABLE[0].tier_id = 0;
    CUSTOMER_TIER_TABLE[0].base_discount = 0.00;
    CUSTOMER_TIER_TABLE[0].volume_multiplier = 1.00;

    CUSTOMER_TIER_TABLE[1].tier_id = 1;
    CUSTOMER_TIER_TABLE[1].base_discount = 0.03;
    CUSTOMER_TIER_TABLE[1].volume_multiplier = 1.25;

    CUSTOMER_TIER_TABLE[2].tier_id = 2;
    CUSTOMER_TIER_TABLE[2].base_discount = 0.07;
    CUSTOMER_TIER_TABLE[2].volume_multiplier = 1.50;

    CUSTOMER_TIER_TABLE[3].tier_id = 3;
    CUSTOMER_TIER_TABLE[3].base_discount = 0.15;
    CUSTOMER_TIER_TABLE[3].volume_multiplier = 2.00;
}

/**
 * sub_00401080: Validates account status and tier bounds.
 */
int validate_account_status(uint32_t account_id, int customer_tier) {
    if (account_id == 0 || account_id > 9999999) {
        return 0; /* Invalid account number */
    }
    if (customer_tier < 0 || customer_tier >= CUSTOMER_TIERS_COUNT) {
        return 0; /* Invalid customer tier */
    }
    return 1; /* Valid */
}

/**
 * sub_00401100: Computes line item subtotal with volume discount breakpoint.
 * If line quantity >= 100, grants an automatic 5% bulk rebate on this item.
 */
double calculate_line_subtotal(const LineItem *item) {
    if (!item || item->quantity <= 0 || item->unit_price < 0.0) {
        return 0.0;
    }
    double total = (double)item->quantity * item->unit_price;
    if (item->quantity >= 100) {
        total *= 0.95; /* 5% bulk break */
    }
    return total;
}

/**
 * sub_00401180: Computes progressive marginal tax based on TAX_BRACKET_TABLE (0x00405000).
 */
double compute_progressive_tax(double taxable_amount) {
    if (taxable_amount <= 0.0) {
        return 0.0;
    }

    double total_tax = 0.0;
    double prev_threshold = 0.0;

    for (int i = 0; i < TAX_BRACKETS_COUNT; ++i) {
        double current_threshold = TAX_BRACKET_TABLE[i].threshold;
        double current_rate = TAX_BRACKET_TABLE[i].rate;

        if (taxable_amount > prev_threshold) {
            double taxable_in_this_bracket = 0.0;
            if (taxable_amount > current_threshold) {
                taxable_in_this_bracket = current_threshold - prev_threshold;
            } else {
                taxable_in_this_bracket = taxable_amount - prev_threshold;
            }
            total_tax += taxable_in_this_bracket * current_rate;
        } else {
            break;
        }
        prev_threshold = current_threshold;
    }

    return total_tax;
}

/**
 * sub_00401220: Banker's Rounding (Round-Half-To-Even) to 2 decimal places.
 * Crucial accounting precision algorithm that separates authentic systems from naive LLM guesses.
 */
double apply_bankers_rounding(double value) {
    double scaled = value * 100.0;
    double floor_val = floor(scaled);
    double diff = scaled - floor_val;

    double result;
    if (fabs(diff - 0.5) < 1e-9) {
        /* Exact half-cent boundary: round to nearest even integer */
        long long floor_int = (long long)floor_val;
        if (floor_int % 2 == 0) {
            result = floor_val;
        } else {
            result = floor_val + 1.0;
        }
    } else {
        /* Standard nearest rounding */
        result = round(scaled);
    }
    return result / 100.0;
}

/**
 * sub_00401300: Orchestrates end-to-end invoice settlement.
 */
InvoiceResult process_invoice(const InvoiceRequest *request) {
    InvoiceResult res;
    memset(&res, 0, sizeof(InvoiceResult));

    if (!request || !validate_account_status(request->account_id, request->customer_tier)) {
        res.status_code = -1; /* Validation Error */
        return res;
    }

    double gross = 0.0;
    double taxable_gross = 0.0;
    int total_units = 0;

    for (int i = 0; i < request->item_count && i < MAX_ITEMS; ++i) {
        double line_total = calculate_line_subtotal(&request->items[i]);
        gross += line_total;
        total_units += request->items[i].quantity;
        if (!request->items[i].is_tax_exempt) {
            taxable_gross += line_total;
        }
    }

    /* Customer Tier Discount from Global Matrix 0x00405080 */
    CustomerTierConfig tier_cfg = CUSTOMER_TIER_TABLE[request->customer_tier];
    double discount_rate = tier_cfg.base_discount;
    if (total_units >= 500) {
        discount_rate *= tier_cfg.volume_multiplier;
    }
    /* Cap loyalty discount at 30% */
    if (discount_rate > 0.30) {
        discount_rate = 0.30;
    }

    double loyalty_discount = gross * discount_rate;
    double net_subtotal = gross - loyalty_discount;

    /* Taxable base reduction proportional to discount */
    double taxable_net = taxable_gross;
    if (gross > 0.0) {
        taxable_net = taxable_gross * (1.0 - discount_rate);
    }

    /* Compute progressive tax and apply banker's rounding */
    double raw_tax = compute_progressive_tax(taxable_net);
    double rounded_tax = apply_bankers_rounding(raw_tax);
    double final_total = apply_bankers_rounding(net_subtotal + rounded_tax);

    res.gross_subtotal = apply_bankers_rounding(gross);
    res.volume_discount = apply_bankers_rounding(gross * (total_units >= 500 ? 0.02 : 0.0));
    res.loyalty_discount = apply_bankers_rounding(loyalty_discount);
    res.taxable_amount = apply_bankers_rounding(taxable_net);
    res.tax_amount = rounded_tax;
    res.final_total = final_total;
    res.status_code = 1; /* Success */

    return res;
}

/* ============================================================================
 * Standalone Testing & Differential Harness Entry Point
 * ============================================================================ */

#ifndef RUN_AS_LIBRARY
int main(int argc, char **argv) {
    init_tariff_tables();

    /* Standalone Test Example */
    InvoiceRequest req;
    memset(&req, 0, sizeof(InvoiceRequest));
    req.account_id = 10042;
    req.customer_tier = 2; /* Gold: 7% discount */
    req.item_count = 2;
    
    req.items[0].item_id = 101;
    req.items[0].quantity = 10;
    req.items[0].unit_price = 45.00; /* $450.00 */
    req.items[0].is_tax_exempt = 0;

    req.items[1].item_id = 102;
    req.items[1].quantity = 5;
    req.items[1].unit_price = 120.00; /* $600.00 */
    req.items[1].is_tax_exempt = 0;

    InvoiceResult res = process_invoice(&req);
    printf("{\"status\": %d, \"gross\": %.2f, \"loyalty_discount\": %.2f, \"taxable\": %.2f, \"tax\": %.2f, \"total\": %.2f}\n",
           res.status_code, res.gross_subtotal, res.loyalty_discount, res.taxable_amount, res.tax_amount, res.final_total);

    return 0;
}
#endif
