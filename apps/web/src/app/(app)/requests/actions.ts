"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@dph/db";
import { suggestedCreditCap } from "@dph/pipeline";
import { auth } from "@/auth";
import { enqueueDiscover } from "@/lib/queue";

const requestInput = z.object({
  name: z.string().min(1, "Name is required"),
  states: z.array(z.string()).min(1, "Pick at least one state"),
  groupIds: z.array(z.string()).default([]),
  clubsPasted: z.string().optional(),
  tiers: z.array(z.number()).min(1),
  targetCount: z.number().int().min(1),
  perVenue: z.number().int().min(1).max(2),
  perGroup: z.number().int().min(1).max(4),
  creditCap: z.number().int().min(0),
  revealMode: z.enum(["auto", "ask"]),
  schedule: z.enum(["once", "weekly"]).default("once"),
  notes: z.string().optional(),
});

function parseForm(formData: FormData) {
  const num = (k: string, d = 0) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : d;
  };
  const tiers: number[] = [];
  if (formData.get("tier1")) tiers.push(1);
  if (formData.get("tier2")) tiers.push(2);
  if (formData.get("tier3")) tiers.push(3);
  return requestInput.parse({
    name: String(formData.get("name") ?? "").trim(),
    states: formData.getAll("states").map(String),
    groupIds: formData.getAll("groupIds").map(String),
    clubsPasted: String(formData.get("clubsPasted") ?? ""),
    tiers,
    targetCount: num("targetCount", 50),
    perVenue: num("perVenue", 2),
    perGroup: num("perGroup", 4),
    creditCap: num("creditCap", suggestedCreditCap(num("targetCount", 50))),
    revealMode: (String(formData.get("revealMode") ?? "ask") as "auto" | "ask"),
    schedule: (String(formData.get("schedule") ?? "once") as "once" | "weekly"),
    notes: String(formData.get("notes") ?? ""),
  });
}

async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("not authorized");
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error("user not found");
  return user.id;
}

async function saveRequest(formData: FormData, status: "draft" | "queued"): Promise<string> {
  const input = parseForm(formData);
  const createdById = await currentUserId();
  const req = await prisma.request.create({
    data: {
      name: input.name,
      createdById,
      states: input.states,
      groupIds: input.groupIds,
      clubsPasted: input.clubsPasted || null,
      tiers: input.tiers,
      targetCount: input.targetCount,
      creditCap: input.creditCap,
      revealMode: input.revealMode,
      schedule: { kind: input.schedule },
      status,
      notes: input.notes || null,
    },
  });
  revalidatePath("/requests");
  return req.id;
}

export async function createDraft(formData: FormData): Promise<void> {
  await saveRequest(formData, "draft");
  redirect("/requests");
}

export async function runRequest(formData: FormData): Promise<void> {
  const requestId = await saveRequest(formData, "queued");
  const run = await prisma.run.create({
    data: { requestId, status: "queued", startedAt: new Date() },
  });
  await prisma.request.update({ where: { id: requestId }, data: { status: "running" } });
  await enqueueDiscover({ runId: run.id, requestId });
  revalidatePath("/requests");
  redirect("/requests");
}
