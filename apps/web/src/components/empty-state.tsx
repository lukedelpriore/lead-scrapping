import Link from "next/link";

/**
 * Empty state. Every list has one, with a single clear action. Section 9.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "40px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div className="display-md">{title}</div>
      <p style={{ color: "var(--muted)", maxWidth: 440, margin: 0 }}>{body}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          style={{
            marginTop: 8,
            background: "var(--navy)",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
