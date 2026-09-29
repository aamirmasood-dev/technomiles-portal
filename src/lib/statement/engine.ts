// Pure statement calculation. No database or network access here, so it can be unit-tested.
import type { Category, DeductionGroup } from "@/db/schema";

export type EngineLine = {
  storeId: number;
  category: Category;
  amount: number; // signed minor units, seller's point of view
  currency: string;
  date: string; // local YYYY-MM-DD, used for currency conversion
};

export type EngineExpense = {
  id: number | string;
  storeId: number | null;
  providerId: number | null;
  group: DeductionGroup;
  amount: number; // positive = cost
  currency: string;
  date: string;
  description: string;
  recurring: boolean;
};

export type EngineOrder = {
  orderId: number;
  orderNumber: string;
  storeId: number;
  date: string;
  cost: { itemCost: number; handling: number; currency: string; supplier: string | null } | null;
};

export type EngineStore = { id: number; name: string; platform: string };

export type EngineTerm = {
  rateBps: number;
  fixedFee: number;
  groups: DeductionGroup[];
  includeShipping: boolean;
  includeTax: boolean;
  storeIds: number[] | null;
  carryForwardLoss: boolean;
};

// Returns the amount converted into the statement currency, or null if no rate is known.
export type Converter = (amount: number, from: string, date: string) => number | null;

export type EngineInput = {
  period: string;
  currency: string;
  term: EngineTerm;
  stores: EngineStore[];
  providers: { id: number; name: string }[];
  lines: EngineLine[];
  expenses: EngineExpense[];
  orders: EngineOrder[];
  lossBroughtForward: number; // >= 0
  adjustments: { sourcePeriod: string; baseDelta: number }[];
  convert: Converter;
};

export const GROUP_OF_CATEGORY: Partial<Record<Category, DeductionGroup>> = {
  REFUNDS: "REFUNDS",
  MARKETPLACE_FEES: "MARKETPLACE",
  FULFILLMENT_FEES: "MARKETPLACE",
  PAYMENT_FEES: "PAYMENT",
  SHIPPING_LABELS: "SHIPPING",
  ADVERTISING: "ADVERTISING",
  SUBSCRIPTION: "SUBSCRIPTIONS",
  OTHER_FEES: "OTHER_PLATFORM",
  REIMBURSEMENTS: "OTHER_PLATFORM",
  ADJUSTMENTS: "OTHER_PLATFORM",
};

export type StoreSummary = {
  storeId: number;
  name: string;
  platform: string;
  categories: Partial<Record<Category, number>>;
  sales: number;
  shippingCharged: number;
  tax: number;
  gross: number; // what counts toward gross under this term
  platformCosts: number; // positive: all platform deductions on this store (whether applied or not)
  net: number; // gross - platform costs
};

export type GroupSummary = {
  group: DeductionGroup;
  platform: number; // positive cost from platform data
  manual: number; // positive cost from manual expenses / order costs
  total: number;
  applied: boolean; // ticked on the contract term
};

export type Problem = { kind: "MISSING_COST" | "MISSING_FX"; message: string };

export type StatementResult = {
  period: string;
  currency: string;
  rateBps: number;
  fixedFee: number;
  stores: StoreSummary[];
  gross: { sales: number; shippingCharged: number; tax: number; total: number };
  groups: GroupSummary[];
  couriers: { providerId: number | null; name: string; amount: number }[];
  expenses: (EngineExpense & { converted: number })[];
  cogs: { total: number; orderCount: number; costedCount: number; missing: { orderId: number; orderNumber: string; storeName: string; date: string }[] };
  totalDeductions: number;
  baseBeforeCarry: number;
  adjustments: { sourcePeriod: string; baseDelta: number }[];
  adjustmentsTotal: number;
  lossBroughtForward: number;
  base: number;
  lossCarriedOut: number;
  share: number;
  amountDue: number;
  foreign: { currency: string; lines: number }[];
  problems: Problem[];
};

export function computeStatement(input: EngineInput): StatementResult {
  const { term } = input;
  const applied = new Set(term.groups);
  const inScope = (storeId: number | null) =>
    term.storeIds == null ? true : storeId != null && term.storeIds.includes(storeId);
  const problems: Problem[] = [];
  const missingFx = new Map<string, number>();
  const foreign = new Map<string, number>();

  const conv = (amount: number, currency: string, date: string): number => {
    if (currency === input.currency) return amount;
    foreign.set(currency, (foreign.get(currency) ?? 0) + 1);
    const v = input.convert(amount, currency, date);
    if (v == null) {
      const key = `${currency} on ${date}`;
      missingFx.set(key, (missingFx.get(key) ?? 0) + 1);
      return 0;
    }
    return v;
  };

  // --- platform lines, per store ---
  const stores = new Map<number, StoreSummary>();
  for (const s of input.stores) {
    if (!inScope(s.id)) continue;
    stores.set(s.id, {
      storeId: s.id,
      name: s.name,
      platform: s.platform,
      categories: {},
      sales: 0,
      shippingCharged: 0,
      tax: 0,
      gross: 0,
      platformCosts: 0,
      net: 0,
    });
  }
  const groupPlatform = new Map<DeductionGroup, number>();
  for (const line of input.lines) {
    const st = stores.get(line.storeId);
    if (!st) continue;
    const amt = conv(line.amount, line.currency, line.date);
    st.categories[line.category] = (st.categories[line.category] ?? 0) + amt;
    const group = GROUP_OF_CATEGORY[line.category];
    if (group) {
      st.platformCosts -= amt;
      groupPlatform.set(group, (groupPlatform.get(group) ?? 0) - amt);
    } else if (line.category === "SALES") st.sales += amt;
    else if (line.category === "SHIPPING_CHARGED") st.shippingCharged += amt;
    else st.tax += amt; // TAX_COLLECTED, TAX_WITHHELD
  }
  for (const st of stores.values()) {
    st.gross = st.sales + (term.includeShipping ? st.shippingCharged : 0) + (term.includeTax ? st.tax : 0);
    st.net = st.gross - st.platformCosts;
  }
  const storeList = [...stores.values()];
  const gross = {
    sales: sum(storeList.map((s) => s.sales)),
    shippingCharged: sum(storeList.map((s) => s.shippingCharged)),
    tax: sum(storeList.map((s) => s.tax)),
    total: sum(storeList.map((s) => s.gross)),
  };

  // --- manual expenses (incl. recurring and couriers) ---
  const groupManual = new Map<DeductionGroup, number>();
  const couriers = new Map<number | null, number>();
  const expenses: StatementResult["expenses"] = [];
  for (const e of input.expenses) {
    if (!inScope(e.storeId)) continue;
    const converted = conv(e.amount, e.currency, e.date);
    expenses.push({ ...e, converted });
    groupManual.set(e.group, (groupManual.get(e.group) ?? 0) + converted);
    if (e.providerId != null) couriers.set(e.providerId, (couriers.get(e.providerId) ?? 0) + converted);
  }
  const providerName = new Map(input.providers.map((p) => [p.id, p.name]));

  // --- per-order cost of goods ---
  const storeName = new Map(input.stores.map((s) => [s.id, s.name]));
  const scopedOrders = input.orders.filter((o) => inScope(o.storeId));
  let cogsTotal = 0;
  const missing: StatementResult["cogs"]["missing"] = [];
  for (const o of scopedOrders) {
    if (!o.cost) {
      missing.push({ orderId: o.orderId, orderNumber: o.orderNumber, storeName: storeName.get(o.storeId) ?? "", date: o.date });
      continue;
    }
    cogsTotal += conv(o.cost.itemCost + o.cost.handling, o.cost.currency, o.date);
  }
  groupManual.set("COGS", (groupManual.get("COGS") ?? 0) + cogsTotal);
  if (applied.has("COGS") && missing.length > 0) {
    problems.push({ kind: "MISSING_COST", message: `${missing.length} order(s) have no cost entered.` });
  }

  // --- deductions ---
  const groupOrder: DeductionGroup[] = [
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
  ];
  const groups: GroupSummary[] = groupOrder
    .map((g) => {
      const platform = groupPlatform.get(g) ?? 0;
      const manual = groupManual.get(g) ?? 0;
      return { group: g, platform, manual, total: platform + manual, applied: applied.has(g) };
    })
    .filter((g) => g.applied || g.total !== 0);
  const totalDeductions = sum(groups.filter((g) => g.applied).map((g) => g.total));

  // --- base, carry-forward, share ---
  const baseBeforeCarry = gross.total - totalDeductions;
  const adjustmentsTotal = sum(input.adjustments.map((a) => a.baseDelta));
  const lossBroughtForward = term.carryForwardLoss ? input.lossBroughtForward : 0;
  let base = baseBeforeCarry + adjustmentsTotal - lossBroughtForward;
  let lossCarriedOut = 0;
  if (base < 0) {
    if (term.carryForwardLoss) lossCarriedOut = -base;
    base = 0;
  }
  const share = Math.round((base * term.rateBps) / 10000);
  const amountDue = share + term.fixedFee;

  for (const [key, n] of missingFx) {
    problems.push({ kind: "MISSING_FX", message: `No exchange rate for ${key} (${n} line(s)).` });
  }

  return {
    period: input.period,
    currency: input.currency,
    rateBps: term.rateBps,
    fixedFee: term.fixedFee,
    stores: storeList,
    gross,
    groups,
    couriers: [...couriers.entries()].map(([id, amount]) => ({
      providerId: id,
      name: (id != null && providerName.get(id)) || "Courier",
      amount,
    })),
    expenses,
    cogs: { total: cogsTotal, orderCount: scopedOrders.length, costedCount: scopedOrders.length - missing.length, missing },
    totalDeductions,
    baseBeforeCarry,
    adjustments: input.adjustments,
    adjustmentsTotal,
    lossBroughtForward,
    base,
    lossCarriedOut,
    share,
    amountDue,
    foreign: [...foreign.entries()].map(([currency, lines]) => ({ currency, lines })),
    problems,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
