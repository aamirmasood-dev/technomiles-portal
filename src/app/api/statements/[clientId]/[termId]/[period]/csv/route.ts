import { getCurrentUser } from "@/lib/auth";
import { fromMinor } from "@/lib/money";
import { isPeriod } from "@/lib/period";
import { getClientOr404, getTermOr404, parseId } from "@/lib/queries";
import { getStatementView } from "@/lib/statement/load";
import { CATEGORY_LABELS, DEDUCTION_GROUP_LABELS } from "@/lib/labels";
import { CATEGORIES } from "@/db/schema";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/statements/[clientId]/[termId]/[period]/csv">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const p = await ctx.params;
  if (!isPeriod(p.period)) return new Response("Bad period", { status: 400 });
  const client = await getClientOr404(parseId(p.clientId));
  const term = await getTermOr404(client.id, parseId(p.termId));
  const v = await getStatementView(client, term, p.period);
  const r = v.result;

  const rows: (string | number)[][] = [["Section", "Item", "Store or date", `Amount (${r.currency})`]];
  rows.push(["Info", "Client", "", client.name], ["Info", "Period", "", r.period], ["Info", "Status", "", v.closed ? `Closed ${v.closed.invoiceNumber}` : "Draft"]);
  for (const s of r.stores) {
    for (const c of CATEGORIES) {
      if (s.categories[c]) rows.push(["Platform", CATEGORY_LABELS[c], s.name, fromMinor(s.categories[c]!)]);
    }
  }
  for (const e of r.expenses) {
    rows.push(["Expense", `${DEDUCTION_GROUP_LABELS[e.group]}: ${e.description}`, e.date, fromMinor(-e.converted)]);
  }
  if (r.cogs.total) rows.push(["Expense", `Cost of goods (${r.cogs.costedCount} orders)`, "", fromMinor(-r.cogs.total)]);
  for (const g of r.groups) {
    rows.push(["Deduction", DEDUCTION_GROUP_LABELS[g.group] + (g.applied ? "" : " (not deducted)"), "", fromMinor(-g.total)]);
  }
  rows.push(["Summary", "Gross sales", "", fromMinor(r.gross.total)]);
  rows.push(["Summary", "Total deductions", "", fromMinor(-r.totalDeductions)]);
  rows.push(["Summary", `${term.baseLabel} for the month`, "", fromMinor(r.baseBeforeCarry)]);
  for (const a of r.adjustments) rows.push(["Summary", `Adjustment for ${a.sourcePeriod}`, "", fromMinor(a.baseDelta)]);
  if (r.lossBroughtForward) rows.push(["Summary", "Loss brought forward", "", fromMinor(-r.lossBroughtForward)]);
  rows.push(["Summary", `${term.baseLabel} after carry-forward`, "", fromMinor(r.base)]);
  rows.push(["Summary", `Share at ${r.rateBps / 100}%`, "", fromMinor(r.share)]);
  if (r.fixedFee) rows.push(["Summary", "Fixed monthly fee", "", fromMinor(r.fixedFee)]);
  rows.push(["Summary", "Amount due", "", fromMinor(r.amountDue)]);
  if (r.lossCarriedOut) rows.push(["Summary", "Loss carried forward", "", fromMinor(r.lossCarriedOut)]);

  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const name = `${client.name.replace(/[^A-Za-z0-9]+/g, "-")}-${r.period}${v.closed ? `-${v.closed.invoiceNumber}` : "-draft"}.csv`;
  return new Response("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
