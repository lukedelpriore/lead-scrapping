import Link from "next/link";
import { prisma } from "@dph/db";
import { CREDIT_PLAN, PIPELINE_DEFAULTS } from "@dph/config";
import { PageHeader } from "@/components/page-header";
import { LedgerBar } from "@/components/ledger";
import { Scorecard, type StageCounts } from "@/components/scorecard";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [settings, rocketreach, activeRuns, lastLeads, creditsUsedAgg] =
    await Promise.all([
      prisma.settings.findFirst(),
      prisma.integrationStatus.findUnique({ where: { provider: "rocketreach" } }),
      prisma.run.findMany({
        where: { status: { in: ["running", "waiting_quota", "needs_review", "queued"] } },
        include: { request: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.lead.findMany({
        orderBy: { deliveredAt: "desc" },
        take: 5,
        include: { request: true },
      }),
      prisma.creditsLedger.aggregate({
        _sum: { delta: true },
        where: { kind: "charge" },
      }),
    ]);

  const reserve = settings?.reserveCredits ?? PIPELINE_DEFAULTS.reserve_credits;
  const used = Math.abs(creditsUsedAgg._sum.delta ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="Dashboard">
        <Link
          href="/requests/new"
          style={{
            background: "var(--navy)",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          New request
        </Link>
      </PageHeader>

      <LedgerBar
        total={CREDIT_PLAN.person_exports_total}
        used={used}
        reserved={reserve}
        resetLabel="Jun 15, 2027"
      />

      <div className="card" style={{ padding: 20 }}>
        <div className="label" style={{ marginBottom: 8 }}>
          RocketReach status
        </div>
        {rocketreach ? (
          <div style={{ fontSize: 14 }}>
            <div>Plan: {rocketreach.planName ?? "unknown"}</div>
            <div style={{ color: "var(--muted)" }}>
              Last checked:{" "}
              {rocketreach.lastOkAt
                ? new Date(rocketreach.lastOkAt).toLocaleString("en-US")
                : "never"}
            </div>
            {rocketreach.lastError ? (
              <div style={{ color: "var(--error)" }}>{rocketreach.lastError}</div>
            ) : null}
          </div>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>
            Not connected yet. Add the key on the server and test it on Settings.
          </div>
        )}
      </div>

      <section>
        <div className="label" style={{ marginBottom: 8 }}>
          Active runs
        </div>
        {activeRuns.length === 0 ? (
          <EmptyState
            title="No active runs"
            body="When a request runs, its scorecard shows here with live counts."
            actionLabel="New request"
            actionHref="/requests/new"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activeRuns.map((run) => (
              <div key={run.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="heading">{run.request.name}</span>
                  <span className="label">{run.status}</span>
                </div>
                <Scorecard counts={(run.stageCounts as StageCounts) ?? {}} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="label" style={{ marginBottom: 8 }}>
          Last deliveries
        </div>
        {lastLeads.length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            body="Delivered leads appear here with a link to open the sheet."
          />
        ) : (
          <div className="card" style={{ padding: 8 }}>
            {lastLeads.map((lead) => (
              <div
                key={lead.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                }}
              >
                <span>{lead.request.name}</span>
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {lead.deliveredAt
                    ? new Date(lead.deliveredAt).toLocaleDateString("en-US")
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
