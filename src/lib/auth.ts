import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { readSession } from "./session";

// Access model:
//  ADMIN - everything.
//  STAFF - client-side work only: client list, orders and Jawa order costs, client expenses
//          (courier/shipping etc.), stores (connect / edit). No profit sheets, statements,
//          transactions, contract terms, company accounts, payroll, partners, invoices or settings.

export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, session.userId));
  return user && user.active ? user : null;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export const isAdmin = (user: CurrentUser | null) => user?.role === "ADMIN";

// Call at the top of every protected page and server action.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Pages and actions for administrators only. Staff get a 404 rather than a hint that the page exists.
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}
