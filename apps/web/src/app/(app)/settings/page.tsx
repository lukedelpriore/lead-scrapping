import { prisma } from "@dph/db";
import { getEnv, integrationPresence, PIPELINE_DEFAULTS } from "@dph/config";
import { PageHeader } from "@/components/page-header";
import { TestButton } from "@/components/test-button";
import {
  runRocketReachTest,
  runSheetsTest,
  runBrevoTest,
  runClaudePing,
} from "./actions";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid var(--card-border)",
      }}
    >
      <span className="label">{label}</span>
      <span style={{ fontSize: 14 }}>{value}</span>
    </div>
  );
}

function Status({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span style={{ color: ok ? "var(--fairway)" : "var(--muted)", fontWeight: 500 }}>
      {ok ? on : off}
    </span>
  );
}

export default async function SettingsPage() {
  const env = getEnv();
  const presence = integrationPresence(env);
  const [settings, users] = await Promise.all([
    prisma.settings.findFirst(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="Settings" />

      <section className="card" style={{ padding: 20 }}>
        <div className="heading" style={{ marginBottom: 12 }}>
          Integrations
        </div>
        <Row
          label="RocketReach"
          value={<Status ok={presence.rocketreach} on="Key present" off="No key" />}
        />
        <Row
          label="Google Sheets"
          value={<Status ok={presence.google_sheets} on="Service account present" off="No service account" />}
        />
        <Row
          label="Sheet id"
          value={<Status ok={presence.sheet_id} on="Set" off="Not set" />}
        />
        <Row
          label="Brevo email"
          value={<Status ok={presence.brevo} on="Key present" off="No key, delivery disabled" />}
        />
        <Row label="Serper" value={<Status ok={presence.serper} on="Key present" off="No key, uses fallbacks" />} />
        <Row
          label="AI mode"
          value={env.AI_MODE === "on" ? "AI classifier" : "Rules mode, no key needed"}
        />
        <Row label="Places" value={<Status ok={presence.places} on="On" off="Off" />} />
        <Row label="Reveal mode" value={<strong>{env.REVEAL_MODE}</strong>} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          <TestButton label="Test RocketReach" action={runRocketReachTest} />
          <TestButton label="Test sheet write" action={runSheetsTest} />
          <TestButton label="Test Brevo" action={runBrevoTest} />
          <TestButton label="Check AI mode" action={runClaudePing} />
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          These tests are free. The RocketReach test uses the account endpoint,
          the sheet test writes and removes one row, and the Brevo test checks
          the account. None spends a credit.
        </p>
      </section>

      <section className="card" style={{ padding: 20 }}>
        <div className="heading" style={{ marginBottom: 12 }}>
          Pipeline numbers
        </div>
        <Row label="Reserve credits" value={settings?.reserveCredits ?? PIPELINE_DEFAULTS.reserve_credits} />
        <Row label="Max credits per request" value={settings?.maxCreditsPerRequest ?? PIPELINE_DEFAULTS.max_credits_per_request} />
        <Row label="Max credits per day" value={settings?.maxCreditsPerDay ?? PIPELINE_DEFAULTS.max_credits_per_day} />
        <Row label="Auto reveal min confidence" value={settings?.autoRevealMinConfidence ?? PIPELINE_DEFAULTS.auto_reveal_min_confidence} />
        <Row label="Max contacts per venue" value={settings?.maxContactsPerVenue ?? PIPELINE_DEFAULTS.max_contacts_per_venue} />
        <Row label="Max contacts per group" value={settings?.maxContactsPerGroup ?? PIPELINE_DEFAULTS.max_contacts_per_group} />
        <Row label="Search quota headroom" value={settings?.searchQuotaHeadroom ?? PIPELINE_DEFAULTS.search_quota_headroom} />
        <Row label="Timezone" value={settings?.timezone ?? PIPELINE_DEFAULTS.timezone} />
      </section>

      <section className="card" style={{ padding: 20 }}>
        <div className="heading" style={{ marginBottom: 12 }}>
          Users
        </div>
        {users.map((u) => (
          <Row key={u.id} label={u.email} value={u.role} />
        ))}
      </section>
    </div>
  );
}
