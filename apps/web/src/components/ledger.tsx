/**
 * Ledger bar, Section 10.4. One horizontal bar for the plan year:
 * used (Navy), reserved (Brass hatch), available (Stone), a brass tick at the
 * reserve line, and the reset date at the right end. Brass is credits only.
 */
export function LedgerBar({
  total,
  used,
  reserved,
  resetLabel,
}: {
  total: number;
  used: number;
  reserved: number;
  resetLabel: string;
}) {
  const usedPct = total > 0 ? (used / total) * 100 : 0;
  const reservedPct = total > 0 ? (reserved / total) * 100 : 0;
  const available = Math.max(0, total - used - reserved);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="display-lg" style={{ marginBottom: 2 }}>
        {available.toLocaleString("en-US")}
      </div>
      <div className="label" style={{ marginBottom: 14 }}>
        Export credits, plan year ending {resetLabel}
      </div>
      <div
        style={{
          position: "relative",
          height: 16,
          borderRadius: 8,
          background: "var(--stone)",
          overflow: "hidden",
          border: "1px solid var(--card-border)",
        }}
        role="img"
        aria-label={`${used} used, ${reserved} reserved, ${available} available of ${total}`}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${usedPct}%`,
            background: "var(--navy)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${usedPct}%`,
            top: 0,
            bottom: 0,
            width: `${reservedPct}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--brass) 0, var(--brass) 3px, transparent 3px, transparent 6px)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span>
          <span className="mono">{used.toLocaleString("en-US")}</span> used
          {"  "}·{"  "}
          <span className="mono">{reserved.toLocaleString("en-US")}</span> reserved
        </span>
        <span>{resetLabel}</span>
      </div>
    </div>
  );
}
