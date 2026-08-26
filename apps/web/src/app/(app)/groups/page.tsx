import { prisma } from "@dph/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    orderBy: [{ venueCount: "desc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Groups" />

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          body="Management groups collect their clubs so one request can cover a whole portfolio."
        />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="dph-num">Venues</th>
                <th>States</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const states = Array.isArray(g.states) ? (g.states as string[]) : [];
                return (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="dph-num mono">{g.venueCount}</td>
                    <td className="mono">{states.join(", ")}</td>
                    <td className="label">{g.status}</td>
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
