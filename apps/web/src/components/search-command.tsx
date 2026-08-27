"use client";

import { useState } from "react";
import { createSearch } from "@/app/(app)/search/actions";

const EXAMPLES = [
  "Find roofing company owners in Ohio and Michigan, about 200 businesses",
  "Find med spa owners in Florida, about 150 businesses",
  "Find HVAC company owners in Texas and Arizona, about 300 businesses",
];

/** Light client preview of what the command will search for. Cosmetic only. */
function preview(text: string): { type: string; loc: string; count: string } {
  const t = text.toLowerCase();
  const STATES: Record<string, string> = {
    ohio: "Ohio", michigan: "Michigan", florida: "Florida", texas: "Texas",
    arizona: "Arizona", "new york": "New York", california: "California",
    georgia: "Georgia", "north carolina": "North Carolina", pennsylvania: "Pennsylvania",
  };
  const locs = Object.keys(STATES).filter((k) => t.includes(k)).map((k) => STATES[k]);
  let type = "Businesses";
  if (/roof/.test(t)) type = "Roofing companies";
  else if (/hvac/.test(t)) type = "HVAC companies";
  else if (/med ?spa/.test(t)) type = "Med spas";
  else if (/dent/.test(t)) type = "Dental practices";
  else if (/plumb/.test(t)) type = "Plumbing companies";
  else if (/gym|fitness/.test(t)) type = "Gyms and fitness studios";
  else if (/hotel/.test(t)) type = "Hotels";
  else if (/restaurant/.test(t)) type = "Restaurants";
  const m = t.match(/(\d[\d,]{0,6})/);
  const count = m ? m[1].replace(/,/g, "") : "100";
  return { type, loc: locs.length ? locs.join(", ") : "United States", count };
}

export function SearchCommand() {
  const [text, setText] = useState(EXAMPLES[0]);
  const [pending, setPending] = useState(false);
  const p = preview(text);

  return (
    <form
      action={createSearch}
      onSubmit={() => setPending(true)}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
        <textarea
          name="command"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          spellCheck={false}
          aria-label="Describe who to find"
          style={{
            flex: "1 1 420px",
            minWidth: 0,
            border: "1px solid var(--card-border)",
            background: "#fff",
            color: "var(--ink)",
            borderRadius: 10,
            padding: "13px 15px",
            font: "inherit",
            fontSize: 15,
            lineHeight: 1.45,
            resize: "none",
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            background: "var(--navy)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "0 20px",
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            minHeight: 52,
            whiteSpace: "nowrap",
          }}
        >
          {pending ? "Starting" : "Find leads"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="label">Try</span>
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setText(ex)}
            style={{
              font: "inherit",
              fontSize: 13,
              cursor: "pointer",
              background: "var(--stone)",
              border: "1px solid var(--card-border)",
              color: "var(--ink)",
              padding: "5px 11px",
              borderRadius: 999,
            }}
          >
            {ex.replace("Find ", "").replace(/, about.*/, "")}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          { k: "Business type", v: p.type },
          { k: "Locations", v: p.loc },
          { k: "Target", v: `${p.count} businesses` },
          { k: "Contact wanted", v: "Owner, best contact" },
        ].map((f) => (
          <div
            key={f.k}
            style={{
              background: "#fff",
              border: "1px solid var(--card-border)",
              borderRadius: 10,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 120,
            }}
          >
            <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
              {f.k}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{f.v}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
