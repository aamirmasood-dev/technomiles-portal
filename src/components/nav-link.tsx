"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const linkClass = (active: boolean) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-100"}`;

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link href={href} className={linkClass(active)}>
      {children}
    </Link>
  );
}

export function ClientsNav({ clients }: { clients: { id: number; name: string; active: boolean }[] }) {
  const pathname = usePathname();
  const inClients = pathname.startsWith("/clients");
  const [open, setOpen] = useState(true);
  const activeId = pathname.match(/^\/clients\/(\d+)/)?.[1];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between ${linkClass(inClients && !activeId)}`}
      >
        Clients
        <span className={`text-xs text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      </button>
      {open && (
        <div className="mt-1 ml-3 space-y-0.5 border-l border-gray-200 pl-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className={`block truncate rounded-md px-3 py-1.5 text-sm ${
                activeId === String(c.id) ? "bg-indigo-50 font-medium text-indigo-700" : c.active ? "text-gray-700 hover:bg-gray-100" : "text-gray-400 hover:bg-gray-100"
              }`}
            >
              {c.name}
            </Link>
          ))}
          <Link href="/clients" className={`block rounded-md px-3 py-1.5 text-sm ${pathname === "/clients" ? "text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`}>
            All clients
          </Link>
          <Link href="/clients/new" className="block rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">
            + Add client
          </Link>
        </div>
      )}
    </div>
  );
}
