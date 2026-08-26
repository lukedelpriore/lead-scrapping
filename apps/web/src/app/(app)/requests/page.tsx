import Link from "next/link";
import { prisma } from "@dph/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = await prisma.request.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div>
      <PageHeader title="Requests">
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

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="Create a request to find country club decision makers. Searching and dedupe are free."
          actionLabel="New request"
          actionHref="/requests/new"
        />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>States</th>
                <th>Target</th>
                <th className="dph-num">Credits of cap</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const states = Array.isArray(r.states) ? (r.states as string[]) : [];
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      <span className="label">{r.status}</span>
                    </td>
                    <td className="mono">{states.join(", ")}</td>
                    <td className="dph-num mono">{r.targetCount}</td>
                    <td className="dph-num mono">
                      {r.creditsUsed} / {r.creditCap}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {new Date(r.createdAt).toLocaleDateString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
