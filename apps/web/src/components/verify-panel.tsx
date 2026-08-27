"use client";

import { useState } from "react";
import { verifyBatch } from "@/app/(app)/search/actions";

/**
 * Verify a capped batch of owner cells. The number is the operator's chosen
 * batch size, shown with the credit cost. Submitting queues the verify job.
 */
export function VerifyPanel({
  requestId,
  readyCount,
}: {
  requestId: string;
  readyCount: number;
}) {
  const [count, setCount] = useState(Math.min(25, Math.max(1, readyCount)));
  const [pending, setPending] = useState(false);

  const clamp = (n: number) => Math.max(1, Math.min(200, n || 1));

  return (
    <form
      action={verifyBatch}
      onSubmit={() => setPending(true)}
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <span className="label">Verify owner cells</span>
      <div style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: 9, overflow: "hidden" }}>
        <button type="button" onClick={() => setCount((c) => clamp(c - 1))} aria-label="Fewer"
          style={{ border: 0, background: "var(--stone)", width: 34, cursor: "pointer", fontSize: 17 }}>-</button>
        <input
          name="count"
          value={count}
          inputMode="numeric"
          onChange={(e) => setCount(clamp(parseInt(e.target.value, 10)))}
          aria-label="How many to verify"
          style={{ width: 54, border: 0, textAlign: "center", font: "inherit", fontWeight: 600, background: "#fff" }}
          className="mono"
        />
        <button type="button" onClick={() => setCount((c) => clamp(c + 1))} aria-label="More"
          style={{ border: 0, background: "var(--stone)", width: 34, cursor: "pointer", fontSize: 17 }}>+</button>
      </div>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>
        Uses up to <b style={{ color: "var(--brass)" }}>{count}</b> credits
      </span>
      <button
        type="submit"
        disabled={pending || readyCount === 0}
        style={{
          background: readyCount === 0 ? "var(--muted)" : "var(--fairway)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 15px",
          fontWeight: 600,
          fontSize: 13.5,
          cursor: pending || readyCount === 0 ? "default" : "pointer",
        }}
      >
        {pending ? "Verifying" : "Verify this batch"}
      </button>
    </form>
  );
}
