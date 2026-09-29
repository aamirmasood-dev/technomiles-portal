import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { asc } from "drizzle-orm";
import { db, clients } from "@/db";
import { ClientsNav, NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const clientList = await db
    .select({ id: clients.id, name: clients.name, active: clients.active })
    .from(clients)
    .orderBy(asc(clients.name));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white print:hidden">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold">Technomiles</p>
          <p className="text-xs text-gray-500">Accounts Hub</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          <NavLink href="/">Dashboard</NavLink>
          <ClientsNav clients={clientList} />
          <NavLink href="/settings">Settings</NavLink>
        </nav>
        <div className="border-t border-gray-200 px-4 py-4">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
          <form action={logout} className="mt-3">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
