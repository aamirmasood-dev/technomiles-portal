import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, users } from "@/db";
import { SetupForm } from "./setup-form";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const [{ n }] = await db.select({ n: count() }).from(users);
  const firstRun = n === 0;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Technomiles Accounts Hub</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500">{firstRun ? "First-time setup: create the administrator account" : "Sign in to continue"}</p>
        {firstRun ? <SetupForm /> : <LoginForm />}
      </div>
    </main>
  );
}
