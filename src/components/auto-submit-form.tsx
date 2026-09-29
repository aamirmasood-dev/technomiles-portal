"use client";

// GET form that re-submits whenever one of its fields changes.
export function AutoSubmitForm({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <form method="get" className={className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}
