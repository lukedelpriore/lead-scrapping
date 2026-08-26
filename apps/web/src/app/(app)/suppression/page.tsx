import { prisma } from "@dph/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SuppressionImport } from "@/components/suppression-import";

export const dynamic = "force-dynamic";

export default async function SuppressionPage() {
  const [rows, total] = await Promise.all([
    prisma.suppression.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.suppression.count(),
  ]);

  return (
    <div>
      <PageHeader title="Suppression">
        <span className="label">{total} keys</span>
      </PageHeader>

      <div style={{ marginBottom: 20 }}>
        <SuppressionImport />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No suppression keys yet"
          body="Import Luke's existing leads as a CSV or XLSX to keep duplicates out of every run. Upload and column mapping arrive next."
        />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="dph-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Name</th>
                <th>Company</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="label">{s.keyType}</td>
                  <td className="mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.keyValue}
                  </td>
                  <td>{s.displayName ?? ""}</td>
                  <td>{s.displayCompany ?? ""}</td>
                  <td className="label">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
