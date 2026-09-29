// Pure rules for payroll, company profit and partner balances. All amounts in PKR minor units.

export function commissionFor(netSales: number, bps: number): number {
  // Contract: zero or negative net sales = no commission, and losses are not carried forward.
  return netSales > 0 ? Math.round((netSales * bps) / 10000) : 0;
}

export function netPay(p: { basePay: number; bonus: number; deductions: number; advance: number }): number {
  return p.basePay + p.bonus - p.deductions - p.advance;
}

// Split profit (or loss) by share, giving any rounding remainder to the first partner.
export function splitProfit(profit: number, partners: { id: number; shareBps: number }[]): { partnerId: number; amount: number }[] {
  const total = partners.reduce((a, p) => a + p.shareBps, 0);
  const parts = partners.map((p) => ({ partnerId: p.id, amount: Math.trunc((profit * p.shareBps) / total) }));
  const remainder = profit - parts.reduce((a, p) => a + p.amount, 0);
  if (parts.length) parts[0].amount += remainder;
  return parts;
}

export type Settlement = { from: number; to: number; amount: number };

// Who owes whom between partners. Each partner's fair position is their share of the combined balance;
// a partner below it owes the difference to those above it.
export function partnerSettlements(partners: { id: number; shareBps: number; balance: number }[]): Settlement[] {
  const totalShare = partners.reduce((a, p) => a + p.shareBps, 0);
  const totalBalance = partners.reduce((a, p) => a + p.balance, 0);
  const gaps = partners.map((p) => ({ id: p.id, gap: p.balance - Math.round((totalBalance * p.shareBps) / totalShare) }));
  const owe = gaps.filter((g) => g.gap < 0).map((g) => ({ ...g, gap: -g.gap }));
  const owed = gaps.filter((g) => g.gap > 0);
  const out: Settlement[] = [];
  for (const d of owe) {
    for (const c of owed) {
      if (d.gap <= 0) break;
      const amt = Math.min(d.gap, c.gap);
      if (amt <= 0) continue;
      out.push({ from: d.id, to: c.id, amount: amt });
      d.gap -= amt;
      c.gap -= amt;
    }
  }
  return out;
}
