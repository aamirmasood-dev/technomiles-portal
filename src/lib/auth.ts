import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { readSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId));
  return user ?? null;
});

// Call at the top of every protected page and server action.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
