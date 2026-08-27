import { prisma } from "@dph/db";
import { toReadableUsPhone } from "@dph/pipeline";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

interface Email { address?: string; type?: string; grade?: string }
interface Phone { number?: string; type?: string }

/** Pull the best cell, work line, and email out of a contact's stored detail. */
function channels(contact: { emails: unknown; phones: unknown }, venueLine: string | null) {
  const emails = (contact.emails as Email[]) ?? [];
  const phones = (contact.phones as Phone[]) ?? [];
  const mobile = phones.find((p) => (p.type ?? "").toLowerCase().includes("mobile"));
  const other = phones.find((p) => p !== mobile);
  const email = (emails.find((e) => (e.type ?? "").toLowerCase() === "work") ?? emails[0])?.address ?? null;
  return {
    cell: mobile?.number ? toReadableUsPhone(mobile.number) : null,
    work: other?.number ? toReadableUsPhone(other.number) : venueLine ? toReadableUsPhone(venueLine) : null,
    email,
  };
}

export default async function LeadsPage() {
  // Only real, credit charged leads. Placeholder contacts written while reveal
  // is off are not real leads and are not shown here.
  const leads = await prisma.lead.findMany({
    where: { contact: { creditCharged: true } },
    orderBy: { deliveredAt: "desc" },
    take: 500,
    include: { request: true, contact: true, venue: true },
  });

  return (
    <div>
      <PageHeader title="Leads" />

      {leads.length === 0 ? (
        <EmptyState
          title="No verified leads yet"
          body="Verified owner contacts land here with the cell, work line, email, and website. Find businesses on Find leads, then verify a batch to add real contacts. Verifying is the one step that uses a credit, so nothing shows here until you do."
        />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Business</th>
                <th>Location</th>
                <th>Cell</th>
                <th>Work phone</th>
                <th>Email</th>
                <th>Search</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const v = lead.venue;
                const ch = channels(lead.contact, v?.mainLine ?? null);
                const city = v?.city ?? "";
                const state = v?.state ?? "";
                return (
                  <tr key={lead.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{lead.contact.name}</span>
                      {lead.contact.title ? (
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{lead.contact.title}</span>
                      ) : null}
                      {lead.contact.linkedinUrl ? (
                        <a href={lead.contact.linkedinUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--navy)" }}>
                          LinkedIn
                        </a>
                      ) : null}
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{v?.name ?? lead.contact.employer ?? ""}</span>
                      {v?.website ? (
                        <a href={v.website} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: "var(--navy)" }}>
                          {v.website.replace(/^https?:\/\//, "")}
                        </a>
                      ) : null}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {city}{city && state ? ", " : ""}{state}
                    </td>
                    <td className="mono" style={{ color: ch.cell ? "var(--fairway)" : "var(--muted)", fontWeight: ch.cell ? 500 : 400 }}>
                      {ch.cell ?? ""}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)" }}>{ch.work ?? ""}</td>
                    <td>{ch.email ?? ""}</td>
                    <td style={{ color: "var(--muted)" }}>{lead.request.name}</td>
                    <td className="mono" style={{ color: "var(--muted)" }}>
                      {lead.deliveredAt ? new Date(lead.deliveredAt).toLocaleDateString("en-US") : ""}
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
