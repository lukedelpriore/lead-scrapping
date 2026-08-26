"use client";

import { useState, useTransition } from "react";
import { importCsv, type ImportReport } from "@/app/(app)/suppression/actions";

/**
 * CSV upload with a source selector. Auto detects columns on the server and
 * reports rows read, keys created, and duplicates skipped.
 */
export function SuppressionImport() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<ImportReport | null>(null);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="heading" style={{ marginBottom: 12 }}>
        Import a CSV
      </div>
      <form
        action={(fd) =>
          start(async () => {
            setReport(await importCsv(fd));
          })
        }
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}
      >
        <input type="file" name="file" accept=".csv,text/csv" required />
        <select name="source" defaultValue="luke_import" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--card-border)" }}>
          <option value="luke_import">Luke import</option>
          <option value="client">Client</option>
          <option value="prospect">Prospect</option>
          <option value="do_not_contact">Do not contact</option>
          <option value="delivered">Delivered</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          style={{ background: "var(--navy)", color: "#fff", padding: "8px 14px", borderRadius: 8, border: "none", fontWeight: 500, cursor: pending ? "default" : "pointer" }}
        >
          {pending ? "Importing" : "Import"}
        </button>
      </form>
      {report ? (
        <div
          role="status"
          style={{ marginTop: 12, fontSize: 13, color: report.ok ? "var(--fairway)" : "var(--error)" }}
        >
          {report.message}
        </div>
      ) : null}
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, marginBottom: 0 }}>
        Columns are detected automatically: name, company, title, LinkedIn, email, phone, website. Nothing is exported and no credit is spent.
      </p>
    </div>
  );
}
