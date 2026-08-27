"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@dph/db";
import { parseCommand } from "@dph/pipeline";
import { auth } from "@/auth";
import { enqueueRunSearch, enqueueRevealBatch } from "@/lib/queue";

async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("not authorized");
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error("user not found");
  return user.id;
}

/**
 * Start a search from a plain language command. Parses the command, creates the
 * search record and a run, and enqueues the worker. Redirects to the results.
 */
export async function createSearch(formData: FormData): Promise<void> {
  const command = String(formData.get("command") ?? "").trim();
  if (!command) return;
  const parsed = parseCommand(command);
  const createdById = await currentUserId();

  const name = `${parsed.businessType} in ${parsed.locationLabel}`;
  const request = await prisma.request.create({
    data: {
      name,
      createdById,
      command,
      businessType: parsed.businessType,
      keywords: parsed.keywords,
      states: parsed.states,
      groupIds: [],
      tiers: [],
      targetCount: parsed.targetCount,
      creditCap: parsed.targetCount,
      revealMode: "ask",
      status: "running",
    },
  });
  const run = await prisma.run.create({
    data: { requestId: request.id, status: "queued", startedAt: new Date() },
  });
  await enqueueRunSearch({ runId: run.id, requestId: request.id });
  revalidatePath("/search");
  redirect(`/search/${request.id}`);
}

/** Verify a batch of owner cells for a search. Enqueues the reveal job. */
export async function verifyBatch(formData: FormData): Promise<void> {
  await currentUserId();
  const requestId = String(formData.get("requestId") ?? "");
  const count = Math.max(1, Math.min(200, Number(formData.get("count") ?? 25)));
  if (!requestId) return;
  const run = await prisma.run.findFirst({
    where: { requestId },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return;
  await enqueueRevealBatch({ runId: run.id, requestId, count });
  revalidatePath(`/search/${requestId}`);
}
