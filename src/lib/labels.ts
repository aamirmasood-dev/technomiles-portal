import type { Category, DeductionGroup, Platform } from "@/db/schema";

export const PLATFORM_LABELS: Record<Platform, string> = {
  SHOPIFY: "Shopify",
  EBAY: "eBay",
  AMAZON: "Amazon",
  WALMART: "Walmart",
};

export const DEDUCTION_GROUP_LABELS: Record<DeductionGroup, string> = {
  REFUNDS: "Refunds",
  MARKETPLACE: "Marketplace & fulfilment fees",
  PAYMENT: "Payment fees",
  SHIPPING: "Shipping (platform labels & couriers)",
  ADVERTISING: "Advertising",
  SUBSCRIPTIONS: "Subscriptions (plans, apps)",
  OTHER_PLATFORM: "Other platform fees & adjustments",
  COGS: "Cost of goods (per order)",
  PURCHASES: "Stock purchases",
  OTHER_MANUAL: "Other expenses",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  SALES: "Sales",
  SHIPPING_CHARGED: "Shipping charged",
  TAX_COLLECTED: "Tax collected",
  TAX_WITHHELD: "Tax withheld",
  REFUNDS: "Refunds",
  MARKETPLACE_FEES: "Marketplace fees",
  FULFILLMENT_FEES: "Fulfilment fees",
  PAYMENT_FEES: "Payment fees",
  SHIPPING_LABELS: "Shipping labels",
  ADVERTISING: "Advertising",
  SUBSCRIPTION: "Subscription",
  OTHER_FEES: "Other fees",
  REIMBURSEMENTS: "Reimbursements",
  ADJUSTMENTS: "Adjustments",
};

export const CURRENCIES = ["GBP", "USD", "EUR", "CAD", "AUD"] as const;

export const TIMEZONES = [
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Karachi",
  "Europe/Berlin",
  "Australia/Sydney",
] as const;

// Options for the store "region / marketplace" field, per platform.
export const REGION_OPTIONS: Record<Platform, { value: string; label: string }[]> = {
  SHOPIFY: [],
  EBAY: [
    { value: "EBAY_GB", label: "eBay UK (EBAY_GB)" },
    { value: "EBAY_US", label: "eBay US (EBAY_US)" },
    { value: "EBAY_DE", label: "eBay Germany (EBAY_DE)" },
    { value: "EBAY_AU", label: "eBay Australia (EBAY_AU)" },
    { value: "EBAY_CA", label: "eBay Canada (EBAY_CA)" },
  ],
  AMAZON: [
    { value: "EU", label: "Europe (EU): UK, DE, FR, IT, ES …" },
    { value: "NA", label: "North America (NA): US, CA, MX" },
    { value: "FE", label: "Far East (FE)" },
  ],
  WALMART: [{ value: "US", label: "Walmart US" }],
};

export const AMAZON_MARKETPLACES = [
  { value: "A1F83G8C2ARO7P", label: "Amazon.co.uk" },
  { value: "ATVPDKIKX0DER", label: "Amazon.com (US)" },
  { value: "A1PA6795UKMFR9", label: "Amazon.de" },
  { value: "A13V1IB3VIYZZH", label: "Amazon.fr" },
  { value: "APJ6JRA9NG5V4", label: "Amazon.it" },
  { value: "A1RKKUPIHCS9HS", label: "Amazon.es" },
  { value: "A2EUQ1WTGCTBG2", label: "Amazon.ca" },
];
