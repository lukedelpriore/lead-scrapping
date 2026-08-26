"use client";

import { useState, useTransition } from "react";

interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * A button that runs a connection test server action and shows the result in
 * plain words. No exclamation marks, sentence case, tells the operator what to
 * do on failure.
 */
export function TestButton({
  label,
  action,
}: {
  label: string;
  action: () => Promise<TestResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await action());
            } catch (err) {
              setResult({ ok: false, message: (err as Error).message });
            }
          })
        }
        style={{
          alignSelf: "flex-start",
          background: pending ? "var(--muted)" : "var(--navy)",
          color: "#fff",
          padding: "8px 14px",
          borderRadius: 8,
          border: "none",
          cursor: pending ? "default" : "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {pending ? "Testing" : label}
      </button>
      {result ? (
        <div
          role="status"
          style={{
            fontSize: 13,
            color: result.ok ? "var(--fairway)" : "var(--error)",
          }}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
