"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@dph/db";
import { auth } from "@/auth";

async function guard() {
  const session = await auth();
  if (!session?.user) throw new Error("not authorized");
}

export async function approveCandidate(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("candidateId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!id) return;
  await prisma.candidate.update({
    where: { id },
    data: { reviewStatus: "approved" },
  });
  revalidatePath(`/requests/${requestId}`);
}

export async function declineCandidate(formData: FormData): Promise<void> {
  await guard();
  const id = String(formData.get("candidateId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!id) return;
  await prisma.candidate.update({
    where: { id },
    data: { reviewStatus: "declined" },
  });
  revalidatePath(`/requests/${requestId}`);
}
