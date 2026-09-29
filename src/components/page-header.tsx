import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-gray-500 hover:text-gray-800">
          ← {back.label}
        </Link>
      )}
      <div className="mt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      {title && (
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Badge({ tone = "gray", children }: { tone?: "gray" | "green" | "red" | "amber"; children: React.ReactNode }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-800",
  };
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function SyncBadge({ status, at, connected }: { status: string | null; at: Date | null; connected: boolean }) {
  if (!connected) return <Badge tone="amber">Not connected</Badge>;
  if (status === "ERROR") return <Badge tone="red">Error</Badge>;
  if (status === "RUNNING") return <Badge>Syncing…</Badge>;
  if (at) return <span className="text-sm">{at.toISOString().slice(0, 16).replace("T", " ")} UTC</span>;
  return <Badge>Never synced</Badge>;
}
