// Pure invoice arithmetic: status, outstanding amounts, previous balance, payment allocation.

export type InvoiceLike = {
  id: number;
  issueDate: string;
  currency: string;
  amount: number;
  pkrRate: string | number | null;
  settledAt: Date | null;
  voidedAt: Date | null;
};
export type PaymentLike = { invoiceId: number | null; receivedDate: string; amount: number; pkrReceived: number };

export type InvoiceStatus = "VOID" | "PAID" | "SETTLED" | "PARTLY_PAID" | "UNPAID";

export function paidOn(invoice: InvoiceLike, payments: PaymentLike[], upTo?: string) {
  return payments
    .filter((p) => p.invoiceId === invoice.id && (upTo == null || p.receivedDate <= upTo))
    .reduce((a, p) => a + p.amount, 0);
}

export function invoiceSummary(invoice: InvoiceLike, payments: PaymentLike[]) {
  const mine = payments.filter((p) => p.invoiceId === invoice.id);
  const paid = mine.reduce((a, p) => a + p.amount, 0);
  const pkrReceived = mine.reduce((a, p) => a + p.pkrReceived, 0);
  const rate = invoice.pkrRate == null ? null : Number(invoice.pkrRate);
  // PKR the paid part was worth at the invoice rate, vs what the bank actually credited.
  const pkrAtInvoiceRate = rate == null ? null : Math.round(paid * rate);
  const exchangeDifference = pkrAtInvoiceRate == null ? null : pkrReceived - pkrAtInvoiceRate;
  const outstanding = invoice.voidedAt || invoice.settledAt ? 0 : Math.max(0, invoice.amount - paid);
  let status: InvoiceStatus;
  if (invoice.voidedAt) status = "VOID";
  else if (paid >= invoice.amount) status = "PAID";
  else if (invoice.settledAt) status = "SETTLED";
  else if (paid > 0) status = "PARTLY_PAID";
  else status = "UNPAID";
  return {
    paid,
    outstanding,
    writtenOff: invoice.settledAt && !invoice.voidedAt ? Math.max(0, invoice.amount - paid) : 0,
    pkrReceived,
    pkrAtInvoiceRate,
    exchangeDifference,
    pkrEquivalent: rate == null ? null : Math.round(invoice.amount * rate),
    status,
  };
}

const before = (a: InvoiceLike, b: InvoiceLike) => a.issueDate < b.issueDate || (a.issueDate === b.issueDate && a.id < b.id);

// Unpaid balance of the client's earlier invoices (same currency) as it stood when `invoice` was issued.
export function previousBalance(invoice: InvoiceLike, all: InvoiceLike[], payments: PaymentLike[]) {
  return all
    .filter((i) => i.currency === invoice.currency && !i.voidedAt && before(i, invoice))
    .filter((i) => !i.settledAt || i.settledAt.toISOString().slice(0, 10) > invoice.issueDate)
    .reduce((a, i) => a + Math.max(0, i.amount - paidOn(i, payments, invoice.issueDate)), 0);
}

// Splits one receipt across the oldest unpaid invoices first. PKR is split in proportion; the
// last allocation takes the rounding remainder. Anything left over is returned as unallocated.
export function allocateOldestFirst(
  amount: number,
  pkr: number,
  open: { id: number; issueDate: string; outstanding: number }[],
): { allocations: { invoiceId: number | null; amount: number; pkr: number }[] } {
  const sorted = [...open].filter((o) => o.outstanding > 0).sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id - b.id);
  const parts: { invoiceId: number | null; amount: number }[] = [];
  let left = amount;
  for (const o of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, o.outstanding);
    parts.push({ invoiceId: o.id, amount: take });
    left -= take;
  }
  if (left > 0 || parts.length === 0) parts.push({ invoiceId: null, amount: left });
  let pkrLeft = pkr;
  const allocations = parts.map((p, i) => {
    const share = i === parts.length - 1 ? pkrLeft : Math.round((pkr * p.amount) / amount);
    pkrLeft -= share;
    return { ...p, pkr: share };
  });
  return { allocations };
}
