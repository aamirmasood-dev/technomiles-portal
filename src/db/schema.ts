import {
  mysqlTable,
  serial,
  bigint,
  int,
  varchar,
  char,
  text,
  mediumtext,
  boolean,
  date,
  datetime,
  timestamp,
  json,
  decimal,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

// Money is always stored as integer minor units (pence / cents).
const money = (name: string) => bigint(name, { mode: "number" });
const id = (name: string) => bigint(name, { mode: "number", unsigned: true });

export const PLATFORMS = ["SHOPIFY", "EBAY", "AMAZON", "WALMART"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CATEGORIES = [
  "SALES",
  "SHIPPING_CHARGED",
  "TAX_COLLECTED",
  "TAX_WITHHELD",
  "REFUNDS",
  "MARKETPLACE_FEES",
  "FULFILLMENT_FEES",
  "PAYMENT_FEES",
  "SHIPPING_LABELS",
  "ADVERTISING",
  "SUBSCRIPTION",
  "OTHER_FEES",
  "REIMBURSEMENTS",
  "ADJUSTMENTS",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Deduction groups: the checkboxes on a contract term. Manual expenses are tagged with one.
export const DEDUCTION_GROUPS = [
  "REFUNDS",
  "MARKETPLACE",
  "PAYMENT",
  "SHIPPING",
  "ADVERTISING",
  "SUBSCRIPTIONS",
  "OTHER_PLATFORM",
  "COGS",
  "PURCHASES",
  "OTHER_MANUAL",
] as const;
export type DeductionGroup = (typeof DEDUCTION_GROUPS)[number];

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  name: varchar("name", { length: 191 }).notNull(),
  passwordHash: varchar("password_hash", { length: 100 }).notNull(),
  lastLoginAt: datetime("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clients = mysqlTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  // Currency the statement and invoice are in; foreign sales are converted into it.
  currency: char("currency", { length: 3 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  contactName: varchar("contact_name", { length: 191 }),
  email: varchar("email", { length: 191 }),
  billingAddress: text("billing_address"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const stores = mysqlTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    clientId: id("client_id").notNull(),
    platform: mysqlEnum("platform", PLATFORMS).notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    // e.g. EBAY_GB / EBAY_US, Amazon region NA / EU
    region: varchar("region", { length: 32 }),
    marketplaceId: varchar("marketplace_id", { length: 64 }),
    // Seller username / shop domain, for display only
    accountRef: varchar("account_ref", { length: 191 }),
    credentialsEnc: text("credentials_enc"),
    syncStartDate: date("sync_start_date", { mode: "string" }).notNull(),
    lastSyncAt: datetime("last_sync_at"),
    lastSyncStatus: mysqlEnum("last_sync_status", ["OK", "ERROR", "RUNNING"]),
    lastSyncMessage: text("last_sync_message"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stores_client_idx").on(t.clientId)],
);

export const orders = mysqlTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    storeId: id("store_id").notNull(),
    externalId: varchar("external_id", { length: 191 }).notNull(),
    orderNumber: varchar("order_number", { length: 191 }),
    orderDate: datetime("order_date").notNull(),
    status: varchar("status", { length: 64 }),
    currency: char("currency", { length: 3 }).notNull(),
    total: money("total"),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("orders_store_ext_uq").on(t.storeId, t.externalId),
    index("orders_date_idx").on(t.orderDate),
  ],
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: id("order_id").notNull(),
    externalId: varchar("external_id", { length: 191 }).notNull(),
    sku: varchar("sku", { length: 191 }),
    title: varchar("title", { length: 512 }),
    quantity: int("quantity").notNull(),
    unitPrice: money("unit_price"),
  },
  (t) => [uniqueIndex("order_items_order_ext_uq").on(t.orderId, t.externalId)],
);

// Per-order cost of goods (Jawa): supplier, item cost and handling entered by hand.
export const orderCosts = mysqlTable("order_costs", {
  id: serial("id").primaryKey(),
  orderId: id("order_id").notNull().unique(),
  supplier: varchar("supplier", { length: 191 }),
  itemCost: money("item_cost").notNull(),
  handling: money("handling").notNull().default(0),
  currency: char("currency", { length: 3 }).notNull(),
  notes: text("notes"),
  updatedBy: id("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const ledgerLines = mysqlTable(
  "ledger_lines",
  {
    id: serial("id").primaryKey(),
    storeId: id("store_id").notNull(),
    externalId: varchar("external_id", { length: 191 }).notNull(),
    orderId: id("order_id"),
    orderExternalId: varchar("order_external_id", { length: 191 }),
    postedAt: datetime("posted_at").notNull(), // UTC
    category: mysqlEnum("category", CATEGORIES).notNull(),
    amount: money("amount").notNull(), // signed, seller's point of view
    currency: char("currency", { length: 3 }).notNull(),
    description: varchar("description", { length: 512 }),
    sourceType: varchar("source_type", { length: 64 }),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("ledger_store_ext_uq").on(t.storeId, t.externalId),
    index("ledger_posted_idx").on(t.storeId, t.postedAt),
  ],
);

// External couriers per client (Parcelforce, EVRI, ShipStation, ...).
export const shippingProviders = mysqlTable("shipping_providers", {
  id: serial("id").primaryKey(),
  clientId: id("client_id").notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  active: boolean("active").notNull().default(true),
});

// Amounts are positive costs (a negative amount is a credit).
export const manualExpenses = mysqlTable(
  "manual_expenses",
  {
    id: serial("id").primaryKey(),
    clientId: id("client_id").notNull(),
    storeId: id("store_id"),
    shippingProviderId: id("shipping_provider_id"),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    group: mysqlEnum("deduction_group", DEDUCTION_GROUPS).notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: varchar("description", { length: 512 }),
    createdBy: id("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("manual_expenses_client_date_idx").on(t.clientId, t.expenseDate)],
);

// Monthly charges applied automatically to every month in range (e.g. Shopify plan, apps).
export const recurringExpenses = mysqlTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  clientId: id("client_id").notNull(),
  storeId: id("store_id"),
  group: mysqlEnum("deduction_group", DEDUCTION_GROUPS).notNull(),
  amount: money("amount").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  startMonth: char("start_month", { length: 7 }).notNull(), // YYYY-MM
  endMonth: char("end_month", { length: 7 }),
  active: boolean("active").notNull().default(true),
});

export const fxRates = mysqlTable(
  "fx_rates",
  {
    id: serial("id").primaryKey(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
  },
  (t) => [uniqueIndex("fx_uq").on(t.rateDate, t.base, t.quote)],
);

export const contractTerms = mysqlTable("contract_terms", {
  id: serial("id").primaryKey(),
  clientId: id("client_id").notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  baseLabel: varchar("base_label", { length: 64 }).notNull(),
  // Rate in basis points: 10% = 1000, 50% = 5000
  rateBps: int("rate_bps").notNull(),
  fixedFee: money("fixed_fee").notNull().default(0),
  groups: json("deduction_groups").$type<DeductionGroup[]>().notNull(),
  includeShipping: boolean("include_shipping").notNull().default(true),
  includeTax: boolean("include_tax").notNull().default(false),
  // null = all of the client's stores
  storeIds: json("store_ids").$type<number[] | null>(),
  carryForwardLoss: boolean("carry_forward_loss").notNull().default(true),
  effectiveFrom: char("effective_from", { length: 7 }).notNull(),
  effectiveTo: char("effective_to", { length: 7 }),
});

export const statements = mysqlTable(
  "statements",
  {
    id: serial("id").primaryKey(),
    clientId: id("client_id").notNull(),
    termId: id("term_id").notNull(),
    period: char("period", { length: 7 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    base: money("base").notNull(),
    amountDue: money("amount_due").notNull(),
    lossCarriedOut: money("loss_carried_out").notNull().default(0),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    snapshot: json("snapshot").notNull(),
    closedAt: datetime("closed_at").notNull(),
    closedBy: id("closed_by"),
  },
  (t) => [uniqueIndex("statements_uq").on(t.clientId, t.termId, t.period)],
);

// Differences found in already-closed months, carried into a later month's statement.
export const statementAdjustments = mysqlTable("statement_adjustments", {
  id: serial("id").primaryKey(),
  clientId: id("client_id").notNull(),
  termId: id("term_id").notNull(),
  sourcePeriod: char("source_period", { length: 7 }).notNull(),
  appliedPeriod: char("applied_period", { length: 7 }).notNull(),
  baseDelta: money("base_delta").notNull(),
  description: varchar("description", { length: 512 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Single row (id = 1): Technomiles' own details shown on invoices.
export const businessSettings = mysqlTable("business_settings", {
  id: int("id").primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  address: text("address"),
  email: varchar("email", { length: 191 }),
  phone: varchar("phone", { length: 64 }),
  website: varchar("website", { length: 191 }),
  bankDetails: text("bank_details"),
  logoDataUrl: mediumtext("logo_data_url"),
  invoicePrefix: varchar("invoice_prefix", { length: 32 }).notNull().default("TM-"),
  nextInvoiceNumber: int("next_invoice_number").notNull().default(1),
  paymentTermsDays: int("payment_terms_days").notNull().default(14),
  invoiceFooter: text("invoice_footer"),
});

export const syncLogs = mysqlTable(
  "sync_logs",
  {
    id: serial("id").primaryKey(),
    storeId: id("store_id").notNull(),
    startedAt: datetime("started_at").notNull(),
    finishedAt: datetime("finished_at"),
    status: mysqlEnum("status", ["OK", "ERROR", "RUNNING"]).notNull(),
    rangeFrom: datetime("range_from"),
    rangeTo: datetime("range_to"),
    ordersUpserted: int("orders_upserted").notNull().default(0),
    linesUpserted: int("lines_upserted").notNull().default(0),
    message: text("message"),
  },
  (t) => [index("sync_logs_store_idx").on(t.storeId, t.startedAt)],
);
