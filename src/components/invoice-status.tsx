import type { InvoiceStatus } from "@/lib/invoices/calc";
import { Badge } from "./page-header";

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  switch (status) {
    case "PAID":
      return <Badge tone="green">Paid</Badge>;
    case "SETTLED":
      return <Badge tone="green">Received (settled)</Badge>;
    case "PARTLY_PAID":
      return <Badge tone="amber">Partly paid{overdue ? " · overdue" : ""}</Badge>;
    case "VOID":
      return <Badge>Void</Badge>;
    default:
      return <Badge tone={overdue ? "red" : "amber"}>{overdue ? "Unpaid · overdue" : "Unpaid"}</Badge>;
  }
}
