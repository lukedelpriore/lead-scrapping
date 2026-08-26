import { prisma } from "@dph/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { deliveredAt: "desc" },
    take: 200,
    include: {
      request: true,
      contact: true,
      venue: true,
    },
  });

  return (
    <div>
      <PageHeader title="Leads" />

      {leads.length === 0 ? (
        <EmptyState
          title="No delivered leads yet"
          body="Once a request reveals and delivers contacts, they collect here with search and filters. Reveal stays off during setup, so this is expected."
        />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Title</th>
                <th>Club</th>
                <th>State</th>
                <th>Request</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.contact.name}</td>
                  <td>{lead.contact.title ?? ""}</td>
                  <td>{lead.venue?.name ?? ""}</td>
                  <td className="mono">{lead.venue?.state ?? ""}</td>
                  <td>{lead.request.name}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>
                    {lead.deliveredAt
                      ? new Date(lead.deliveredAt).toLocaleDateString("en-US")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
