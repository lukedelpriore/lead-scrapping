/**
 * Scorecard, Section 10.4. Eight cells: Discover, Dedupe, Qualify, Map, Find,
 * Gate, Reveal, Deliver. Each shows a mono count and a one word state.
 * Completed cells fill Fairway. The Reveal cell is the only Brass one, with
 * credits spent beneath. It is both the progress bar and the summary.
 */

export interface StageCounts {
  discover?: number;
  dedupe?: number;
  qualify?: number;
  map?: number;
  find?: number;
  gate?: number;
  reveal?: number;
  deliver?: number;
}

const STAGES: { key: keyof StageCounts; label: string }[] = [
  { key: "discover", label: "Discover" },
  { key: "dedupe", label: "Dedupe" },
  { key: "qualify", label: "Qualify" },
  { key: "map", label: "Map" },
  { key: "find", label: "Find" },
  { key: "gate", label: "Gate" },
  { key: "reveal", label: "Reveal" },
  { key: "deliver", label: "Deliver" },
];

export function Scorecard({
  counts,
  creditsSpent = 0,
  state,
}: {
  counts: StageCounts;
  creditsSpent?: number;
  state?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
        gap: 8,
      }}
      className="dph-scorecard"
    >
      {STAGES.map((s) => {
        const count = counts[s.key];
        const done = typeof count === "number" && count > 0;
        const isReveal = s.key === "reveal";
        const bg = isReveal
          ? done
            ? "var(--brass)"
            : "var(--card)"
          : done
            ? "var(--fairway)"
            : "var(--card)";
        const fg = done ? "#fff" : "var(--muted)";
        return (
          <div
            key={s.key}
            className="card"
            style={{
              padding: "12px 8px",
              background: bg,
              borderColor: done ? bg : "var(--card-border)",
              textAlign: "center",
            }}
          >
            <div className="label" style={{ color: done ? "rgba(255,255,255,0.8)" : "var(--muted)" }}>
              {s.label}
            </div>
            <div
              className="mono"
              style={{ fontSize: 18, color: fg, marginTop: 4 }}
            >
              {typeof count === "number" ? count : "-"}
            </div>
            {isReveal ? (
              <div style={{ fontSize: 11, color: fg, marginTop: 2 }}>
                {creditsSpent} credits
              </div>
            ) : null}
          </div>
        );
      })}
      {state ? (
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--muted)" }}>
          {state}
        </div>
      ) : null}
    </div>
  );
}
