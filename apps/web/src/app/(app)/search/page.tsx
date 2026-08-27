import Link from "next/link";
import { prisma } from "@dph/db";
import { CREDIT_PLAN, PIPELINE_DEFAULTS } from "@dph/config";
import { PageHeader } from "@/components/page-header";
import { SearchCommand } from "@/components/search-command";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const [settings, ledger, recent] = await Promise.all([
    prisma.settings.findFirst(),
    prisma.creditsLedger.aggregate({ _sum: { delta: true }, where: { kind: "charge" } }),
    prisma.request.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const reserve = settings?.reserveCredits ?? PIPELINE_DEFAULTS.reserve_credits;
  const used = Math.abs(ledger._sum.delta ?? 0);
  const left = CREDIT_PLAN.person_exports_total - used;
  const usedPct = (used / CREDIT_PLAN.person_exports_total) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <PageHeader title="Find leads">
        <div
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px" }}
          title="Verified contacts left this plan year"
        >
          <span className="display-md" style={{ color: "var(--brass)", lineHeight: 1 }}>
            {left.toLocaleString("en-US")}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
            <span className="label">Verified contacts left</span>
            <div style={{ height: 6, borderRadius: 999, background: "var(--stone)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.max(0.4, usedPct)}%`, background: "var(--brass)" }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {used.toLocaleString("en-US")} of {CREDIT_PLAN.person_exports_total.toLocaleString("en-US")} used, {reserve} kept in reserve
            </span>
          </div>
        </div>
      </PageHeader>

      <section className="card" style={{ padding: 22 }}>
        <h2 className="display-md" style={{ margin: "0 0 4px" }}>
          Who do you want to find?
        </h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14, maxWidth: "60ch" }}>
          Describe the businesses and where they are, the way you would ask in plain words. Lead Finder builds
          the list, finds the owner, and gets the best contact it can. Building the list and finding names is free.
          Verifying an owner cell costs one credit, in batches you approve.
        </p>
        <SearchCommand />
      </section>

      <section>
        <div className="label" style={{ marginBottom: 8 }}>
          Recent searches
        </div>
        {recent.length === 0 ? (
          <div className="card" style={{ padding: 20, color: "var(--muted)" }}>
            No searches yet. Describe who you want to find above and start your first one.
          </div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="dph-table">
              <thead>
                <tr>
                  <th>Search</th>
                  <th>Status</th>
                  <th className="dph-num">Verified</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/search/${r.id}`} style={{ color: "var(--navy)", fontWeight: 500 }}>
                        {r.name}
                      </Link>
                    </td>
                    <td><span className="label">{statusLabel(r.status)}</span></td>
                    <td className="dph-num mono">{r.creditsUsed}</td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {new Date(r.createdAt).toLocaleDateString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
