"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requests", label: "Requests" },
  { href: "/leads", label: "Leads" },
  { href: "/suppression", label: "Suppression" },
  { href: "/groups", label: "Groups" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Left rail on desktop. Section 9, 10.3. */
export function LeftRail() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="dph-rail">
      <div style={{ padding: "20px 16px" }}>
        <div className="display-md" style={{ color: "#fff" }}>
          Lead Engine
        </div>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: "8px" }}>
        {ITEMS.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: active ? "#fff" : "rgba(255,255,255,0.72)",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bottom bar on phone. Five items plus Settings folds into the row. */
export function BottomBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="dph-bottombar">
      {ITEMS.map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "10px 4px",
              fontSize: 11,
              textDecoration: "none",
              color: active ? "var(--navy)" : "var(--muted)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
