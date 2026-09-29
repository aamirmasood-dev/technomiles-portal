"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getClientOr404, getTermOr404 } from "@/lib/queries";
import { isPeriod } from "@/lib/period";
import { closeStatement, reopenStatement } from "@/lib/statement/load";

export type CloseState = { error?: string };

export async function closeMonth(clientId: number, termId: number, period: string, _prev: CloseState): Promise<CloseState> {
  const user = await requireUser();
  if (!isPeriod(period)) return { error: "Invalid month." };
  const client = await getClientOr404(clientId);
  const term = await getTermOr404(clientId, termId);
  try {
    await closeStatement(client, term, period, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not close the month." };
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/");
  return {};
}

export async function reopenMonth(clientId: number, termId: number, period: string, _prev: CloseState): Promise<CloseState> {
  await requireUser();
  const client = await getClientOr404(clientId);
  const term = await getTermOr404(clientId, termId);
  try {
    await reopenStatement(client, term, period);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reopen the month." };
  }
  revalidatePath(`/clients/${clientId}`, "layout");
  revalidatePath("/");
  return {};
}
