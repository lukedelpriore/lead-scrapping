import { notFound } from "next/navigation";
import { prisma } from "@dph/db";
import { toReadableUsPhone } from "@dph/pipeline";
import { PageHeader } from "@/components/page-header";
import { VerifyPanel } from "@/components/verify-panel";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

interface Email { address?: string; type?: string; grade?: string }
interface Phone { number?: string; type?: string }

function bestContact(contact: { emails: unknown; phones: unknown } | null | undefined): {
  cell: string | null;
  line: string | null;
  email: string | null;
} {
  if (!contact) return { cell: null, line: null, email: null };
  const emails = (contact.emails as Email[]) ?? [];
  const phones = (contact.phones as Phone[]) ?? [];
  const mobile = phones.find((p) => (p.type ?? "").toLowerCase().includes("mobile"));
  const otherPhone = phones.find((p) => p !== mobile);
  const workEmail = emails.find((e) => (e.type ?? "").toLowerCase() === "work") ?? emails[0];
  return {
    cell: mobile?.number ? toReadableUsPhone(mobile.number) : null,
    line: otherPhone?.number ? toReadableUsPhone(otherPhone.number) : null,
    email: workEmail?.address ?? null,
  };
}

export default async function SearchResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await prisma.request.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!request) notFound();
  const run = request.runs[0];
  const counts = (run?.stageCounts as Record<string, number>) ?? {};

  const candidates = await prisma.candidate.findMany({
    where: { requestId: id },
    include: { venue: true, contacts: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ dedupeStatus: "asc" }, { confidence: "desc" }],
    take: 500,
  });

  const owners = candidates.length;
  const readyUnverified = candidates.filter((c) => c.dedupeStatus === "ready" && c.contacts.length === 0).length;
  const verified = candidates.filter((c) => c.contacts.length > 0).length;
  const alreadyHave = candidates.filter((c) => c.dedupeStatus === "duplicate").length;
  const businessesFound = counts.discover ?? owners;

  const live = request.status === "running" || request.status === "queued";

  return (
    <div>
      <AutoRefresh live={live} />
      <PageHeader title={request.name}>
        <span className="label">{statusLabel(request.status)}</span>
      </PageHeader>

      {live ? (
        <div className="card" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <span className="skeleton" style={{ width: 16, height: 16, borderRadius: 999 }} />
          <span style={{ color: "var(--muted)" }}>
            Finding businesses and owners. Names are free. This updates on its own.
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat n={businessesFound} t="Businesses found" />
        <Stat n={owners} t="Owner names found" />
        <Stat n={candidates.filter((c) => c.dedupeStatus === "ready").length} t="New, not in your lists" good />
        <Stat n={verified} t="Cells verified" brass />
      </div>

      <div
        className="card"
        style={{ padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}
      >
        <VerifyPanel requestId={id} readyCount={readyUnverified} />
        <a
          href={`/api/export/${id}`}
          style={{ background: "#fff", border: "1px solid var(--card-border)", color: "var(--ink)", padding: "9px 14px", borderRadius: 8, textDecoration: "none", fontWeight: 500, fontSize: 13.5 }}
        >
          Download CSV
        </a>
      </div>

      {candidates.length === 0 ? (
        <div className="card" style={{ padding: 24, color: "var(--muted)" }}>
          {live
            ? "Working on it. Businesses and owners will appear here shortly."
            : "No owners found yet. Add a Serper or RocketReach key on Settings, then run a search."}
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const contact = c.contacts[0] ?? null;
                const cc = bestContact(contact);
                return (
                  <tr key={c.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{c.venue?.name ?? c.employer ?? ""}</span>
                      {c.venue?.website ? (
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.venue.website}</span>
                      ) : null}
                    </td>
                    <td>
                      {c.name}
                      {c.title ? <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.title}</span> : null}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {c.venue ? `${c.venue.city ?? ""}${c.venue.city && c.venue.state ? ", " : ""}${c.venue.state ?? ""}` : c.location ?? ""}
                    </td>
                    <td>
                      {cc.cell ? (
                        <span className="mono" style={{ color: "var(--fairway)", fontWeight: 500 }}>{cc.cell} cell</span>
                      ) : (
                        <span className="label" style={{ background: "var(--brass)", color: "#fff", padding: "2px 8px", borderRadius: 999 }}>
                          cell after verify
                        </span>
                      )}
                      {cc.email || cc.line ? (
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                          {[cc.line, cc.email].filter(Boolean).join("  ·  ")}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {c.dedupeStatus === "duplicate" ? (
                        <span className="pill-have">Already have</span>
                      ) : contact ? (
                        <span className="pill-verified">Verified</span>
                      ) : (
                        <span className="pill-new">New</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
        Names and the business list are free. A verified owner cell costs 1 credit. {alreadyHave} of these were already
        in your lists, so they were skipped free.
      </p>
    </div>
  );
}

function Stat({ n, t, good, brass }: { n: number; t: string; good?: boolean; brass?: boolean }) {
  return (
    <div className="card" style={{ padding: "12px 16px", flex: "1 1 150px" }}>
      <div className="display-lg" style={{ color: good ? "var(--fairway)" : brass ? "var(--brass)" : "var(--ink)", lineHeight: 1 }}>
        {n.toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>{t}</div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "running": return "Finding";
    case "queued": return "Queued";
    case "needs_review": return "Ready to verify";
    case "done": return "Done";
    case "done_pending_sheet": return "Done";
    case "failed": return "Needs attention";
    default: return status;
  }
}
