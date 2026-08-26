"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@dph/db";
import {
  parseCsv,
  detectColumns,
  summarizeImport,
  normalizeName,
} from "@dph/pipeline";
import { auth } from "@/auth";

async function guard() {
  const session = await auth();
  if (!session?.user) throw new Error("not authorized");
}

export interface ImportReport {
  ok: boolean;
  message: string;
  rowsRead?: number;
  keysCreated?: number;
  duplicatesSkipped?: number;
}

/**
 * Import a CSV of Luke's existing leads into suppression. Columns are auto
 * detected. Every key is upserted so a re import does not create duplicates.
 * Section 9 Suppression, Section 6.6 key types.
 */
export async function importCsv(formData: FormData): Promise<ImportReport> {
  await guard();
  const file = formData.get("file");
  const source = String(formData.get("source") ?? "luke_import");
  if (!(file instanceof File)) {
    return { ok: false, message: "Choose a CSV file to import." };
  }
  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) {
    return { ok: false, message: "That file had no readable header row." };
  }
  const mapping = detectColumns(headers);
  const summary = summarizeImport(rows, mapping);

  let created = 0;
  let skipped = 0;
  for (const k of summary.keys) {
    const res = await prisma.suppression.upsert({
      where: { keyType_keyValue: { keyType: k.keyType, keyValue: k.keyValue } },
      update: {},
      create: {
        keyType: k.keyType,
        keyValue: k.keyValue,
        displayName: k.displayName,
        displayCompany: k.displayCompany,
        source: source as "luke_import",
        importedFrom: file.name,
      },
    });
    // upsert does not tell us created vs existing directly; count via createdAt.
    if (res.createdAt.getTime() >= Date.now() - 60000) created += 1;
    else skipped += 1;
  }

  revalidatePath("/suppression");
  return {
    ok: true,
    message: `Read ${summary.rowsRead} rows, created ${created} keys, skipped ${skipped} already present.`,
    rowsRead: summary.rowsRead,
    keysCreated: created,
    duplicatesSkipped: skipped + summary.duplicatesSkipped,
  };
}

/** Manual add: mark a group in play, suppressing the whole group. */
export async function addInPlayGroup(formData: FormData): Promise<void> {
  await guard();
  const name = String(formData.get("groupName") ?? "").trim();
  if (!name) return;
  const norm = normalizeName(name);
  await prisma.suppression.upsert({
    where: { keyType_keyValue: { keyType: "group", keyValue: norm } },
    update: {},
    create: { keyType: "group", keyValue: norm, displayName: name, source: "in_play" },
  });
  await prisma.group.updateMany({ where: { nameNormalized: norm }, data: { status: "in_play" } });
  revalidatePath("/suppression");
}
