import { prisma } from "@dph/db";
import { STATE_ORDER, STATE_NAMES, CREDIT_PLAN, PIPELINE_DEFAULTS } from "@dph/config";
import { PageHeader } from "@/components/page-header";
import { createDraft, runRequest } from "../actions";

export const dynamic = "force-dynamic";

const fieldStyle: React.CSSProperties = {
  border: "1px solid var(--card-border)",
  borderRadius: 8,
  padding: "9px 11px",
  fontSize: 15,
  background: "#fff",
  width: "100%",
};

export default async function NewRequestPage() {
  const [groups, settings, ledger] = await Promise.all([
    prisma.group.findMany({ where: { status: { not: "delivered" } }, orderBy: { name: "asc" } }),
    prisma.settings.findFirst(),
    prisma.creditsLedger.aggregate({ _sum: { delta: true }, where: { kind: "charge" } }),
  ]);
  const reserve = settings?.reserveCredits ?? PIPELINE_DEFAULTS.reserve_credits;
  const usedToday = Math.abs(ledger._sum.delta ?? 0);
  const available = CREDIT_PLAN.person_exports_total - reserve - usedToday;

  return (
    <div>
      <PageHeader title="New request" />
      <form style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Name</span>
            <input name="name" required defaultValue="" placeholder="FL Tier 1" style={fieldStyle} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">States</span>
            <select name="states" multiple size={8} style={{ ...fieldStyle, height: "auto" }}>
              {STATE_ORDER.map((code) => (
                <option key={code} value={code}>
                  {code} - {STATE_NAMES[code]}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Hold command or control to pick more than one. Order follows the saved state order.
            </span>
          </label>
        </section>

        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="label">Groups (optional)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
            {groups.map((g) => (
              <label key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" name="groupIds" value={g.id} />
                {g.name}
                {g.status === "in_play" ? (
                  <span className="label" style={{ color: "var(--brass)" }}>in play</span>
                ) : null}
              </label>
            ))}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Or paste club names or websites, one per line</span>
            <textarea name="clubsPasted" rows={4} style={fieldStyle} />
          </label>
        </section>

        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="label">Tiers</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="tier1" defaultChecked /> Tier 1
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="tier2" defaultChecked /> Tier 2
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="tier3" /> Tier 3
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Target contacts</span>
              <input name="targetCount" type="number" min={1} defaultValue={50} style={fieldStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Per venue</span>
              <select name="perVenue" defaultValue={2} style={fieldStyle}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Per group</span>
              <select name="perGroup" defaultValue={4} style={fieldStyle}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">Credit cap</span>
              <input name="creditCap" type="number" min={0} defaultValue={60} style={fieldStyle} />
            </label>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Available now: {available.toLocaleString("en-US")} ({CREDIT_PLAN.person_exports_total.toLocaleString("en-US")} minus {reserve} reserved and {usedToday} used today).
          </div>
        </section>

        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="label">Reveal mode</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="radio" name="revealMode" value="ask" defaultChecked /> Ask, send every candidate to review before spending
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="radio" name="revealMode" value="auto" /> Auto, reveal confident candidates up to the cap
          </label>

          <div className="label" style={{ marginTop: 8 }}>Schedule</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="radio" name="schedule" value="once" defaultChecked /> Once
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="radio" name="schedule" value="weekly" /> Weekly
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Notes</span>
            <textarea name="notes" rows={2} style={fieldStyle} />
          </label>
        </section>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            formAction={createDraft}
            style={{ background: "#fff", border: "1px solid var(--card-border)", color: "var(--ink)", padding: "10px 16px", borderRadius: 8, fontWeight: 500, cursor: "pointer" }}
          >
            Save draft
          </button>
          <button
            formAction={runRequest}
            style={{ background: "var(--navy)", color: "#fff", padding: "10px 16px", borderRadius: 8, border: "none", fontWeight: 500, cursor: "pointer" }}
          >
            Run request
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -8 }}>
          Searching and dedupe are free. Revealing a contact costs 1 credit. Duplicates and failed reveals cost nothing.
        </p>
      </form>
    </div>
  );
}
