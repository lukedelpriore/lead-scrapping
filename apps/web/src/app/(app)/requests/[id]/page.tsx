import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@dph/db";
import { PageHeader } from "@/components/page-header";
import { Scorecard, type StageCounts } from "@/components/scorecard";

export const dynamic = "force-dynamic";

const TABS = ["results", "review", "already", "venues", "log"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  results: "Results",
  review: "Review",
  already: "Already have",
  venues: "Venues",
  log: "Log",
};

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw ?? "")
    ? (tabRaw as Tab)
    : "results";

  const request = await prisma.request.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!request) notFound();
  const run = request.runs[0];

  return (
    <div>
      <PageHeader title={request.name}>
        <span className="label">{request.status}</span>
      </PageHeader>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <Scorecard
          counts={(run?.stageCounts as StageCounts) ?? {}}
          creditsSpent={request.creditsUsed}
        />
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
          Credits used {request.creditsUsed} of {request.creditCap}. Searching and dedupe are free.
        </div>
      </div>

      <nav style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/requests/${id}?tab=${t}`}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: t === tab ? 600 : 400,
              background: t === tab ? "var(--navy)" : "#fff",
              color: t === tab ? "#fff" : "var(--ink)",
              border: "1px solid var(--card-border)",
            }}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      {tab === "results" ? <ResultsTab requestId={id} /> : null}
      {tab === "review" ? <ReviewTab requestId={id} /> : null}
      {tab === "already" ? <AlreadyTab requestId={id} /> : null}
      {tab === "venues" ? <VenuesTab state={request.states} /> : null}
      {tab === "log" ? <LogTab runId={run?.id ?? null} /> : null}
    </div>
  );
}

async function ResultsTab({ requestId }: { requestId: string }) {
  const leads = await prisma.lead.findMany({
    where: { requestId },
    include: { contact: true, venue: true },
    orderBy: { deliveredAt: "desc" },
  });
  if (leads.length === 0) {
    return <Empty text="No delivered leads yet. Reveal is off during setup, so this is expected." />;
  }
  return (
    <Table
      head={["Contact", "Title", "Club", "State"]}
      rows={leads.map((l) => [l.contact.name, l.contact.title ?? "", l.venue?.name ?? "", l.venue?.state ?? ""])}
    />
  );
}

async function ReviewTab({ requestId }: { requestId: string }) {
  const candidates = await prisma.candidate.findMany({
    where: { requestId, dedupeStatus: "ready", reviewStatus: "pending" },
    include: { venue: true },
    orderBy: { confidence: "desc" },
    take: 200,
  });
  if (candidates.length === 0) {
    return <Empty text="Nothing waiting for review." />;
  }
  return (
    <Table
      head={["Name", "Title", "Employer", "Confidence", "Rank"]}
      rows={candidates.map((c) => [
        c.name,
        c.title ?? "",
        c.employer ?? "",
        c.confidence.toFixed(2),
        c.rank,
      ])}
    />
  );
}

async function AlreadyTab({ requestId }: { requestId: string }) {
  const dupes = await prisma.candidate.findMany({
    where: { requestId, dedupeStatus: "duplicate" },
    orderBy: { name: "asc" },
    take: 200,
  });
  if (dupes.length === 0) {
    return <Empty text="No duplicates found. Every candidate is new." />;
  }
  return (
    <Table
      head={["Name", "Employer", "Matched key", "Source"]}
      rows={dupes.map((c) => [c.name, c.employer ?? "", c.dedupeKey ?? "", c.dedupeSource ?? ""])}
    />
  );
}

async function VenuesTab({ state }: { state: unknown }) {
  const states = Array.isArray(state) ? (state as string[]) : [];
  const venues = await prisma.venue.findMany({
    where: states.length ? { state: { in: states } } : {},
    orderBy: [{ tier: "asc" }, { name: "asc" }],
    take: 200,
  });
  if (venues.length === 0) return <Empty text="No venues yet." />;
  return (
    <Table
      head={["Club", "City", "State", "Tier", "Nonmember", "Evidence"]}
      rows={venues.map((v) => [
        v.name,
        v.city ?? "",
        v.state ?? "",
        v.tier != null ? String(v.tier) : "",
        v.nonmemberEvents,
        v.evidenceUrl ? "link" : "",
      ])}
    />
  );
}

async function LogTab({ runId }: { runId: string | null }) {
  if (!runId) return <Empty text="No run yet." />;
  const events = await prisma.runEvent.findMany({
    where: { runId },
    orderBy: { at: "desc" },
    take: 200,
  });
  if (events.length === 0) return <Empty text="No log entries yet." />;
  return (
    <Table
      head={["Level", "Stage", "Message", "At"]}
      rows={events.map((e) => [
        e.level,
        e.stage,
        e.message,
        new Date(e.at).toLocaleString("en-US"),
      ])}
    />
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card" style={{ padding: 24, color: "var(--muted)" }}>
      {text}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="dph-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === "number" ? "dph-num mono" : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
