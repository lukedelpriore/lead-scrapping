import { prisma } from "@dph/db";
import { toReadableUsPhone } from "@dph/pipeline";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface Email { address?: string; type?: string }
interface Phone { number?: string; type?: string }

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Download the results of a search as a CSV. Owner name, business, location,
 * verified cell when available, work line, and email. Blank stays blank.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Not authorized", { status: 401 });
  const { id } = await ctx.params;

  const request = await prisma.request.findUnique({ where: { id } });
  if (!request) return new Response("Not found", { status: 404 });

  const candidates = await prisma.candidate.findMany({
    where: { requestId: id },
    include: { venue: true, contacts: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ dedupeStatus: "asc" }, { confidence: "desc" }],
  });

  const header = ["Business", "Owner", "Title", "Address", "City", "State", "Cell", "Work phone", "Email", "Website", "Status"];
  const rows = candidates.map((c) => {
    const contact = c.contacts[0];
    // Only real, credit charged lookups are exported as contact detail.
    // Fixtures written while reveal is off are placeholders, left blank.
    const verifiedContact = contact?.creditCharged === true ? contact : undefined;
    const emails = (verifiedContact?.emails as Email[]) ?? [];
    const phones = (verifiedContact?.phones as Phone[]) ?? [];
    const mobile = phones.find((p) => (p.type ?? "").toLowerCase().includes("mobile"));
    const other = phones.find((p) => p !== mobile);
    const email = (emails.find((e) => (e.type ?? "").toLowerCase() === "work") ?? emails[0])?.address ?? "";
    const status = c.dedupeStatus === "duplicate" ? "Already have" : verifiedContact ? "Verified" : "New";
    return [
      c.venue?.name ?? c.employer ?? "",
      c.name,
      c.title ?? "",
      c.venue?.address ?? "",
      c.venue?.city ?? "",
      c.venue?.state ?? "",
      mobile?.number ? toReadableUsPhone(mobile.number) : "",
      other?.number ? toReadableUsPhone(other.number) : "",
      email,
      c.venue?.website ?? "",
      status,
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const safeName = (request.name || "leads").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}.csv"`,
    },
  });
}
