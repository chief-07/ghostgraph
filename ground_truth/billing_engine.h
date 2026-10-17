#ifndef BILLING_ENGINE_H
#define BILLING_ENGINE_H

#include <stdint.h>

#define MAX_ITEMS 8
#define TAX_BRACKETS_COUNT 4
#define CUSTOMER_TIERS_COUNT 4

/* Tax Bracket Definition stored at static memory 0x00405000 */
typedef struct {
    double threshold;  /* Threshold ceiling for this bracket */
    double rate;       /* Marginal tax rate (e.g., 0.05 for 5%) */
} TaxBracket;

/* Customer Loyalty Discount Matrix stored at static memory 0x00405080 */
typedef struct {
    int tier_id;              /* 0: Standard, 1: Silver, 2: Gold, 3: Enterprise */
    double base_discount;     /* Percentage off subtotal */
    double volume_multiplier; /* Multiplier for orders over 1000 units */
} CustomerTierConfig;

/* Invoice Line Item */
typedef struct {
    int item_id;
    int quantity;
    double unit_price;
    int is_tax_exempt;
} LineItem;

/* Full Invoice Specification */
typedef struct {
    uint32_t account_id;
    int customer_tier;
    int item_count;
    LineItem items[MAX_ITEMS];
} InvoiceRequest;

/* Computed Invoice Summary */
typedef struct {
    double gross_subtotal;
    double volume_discount;
    double loyalty_discount;
    double taxable_amount;
    double tax_amount;
    double final_total;
    int status_code;
} InvoiceResult;

/* Function Declarations */
void init_tariff_tables(void);
int validate_account_status(uint32_t account_id, int customer_tier);
double calculate_line_subtotal(const LineItem *item);
double compute_progressive_tax(double taxable_amount);
double apply_bankers_rounding(double value);
InvoiceResult process_invoice(const InvoiceRequest *request);

#endif /* BILLING_ENGINE_H */
