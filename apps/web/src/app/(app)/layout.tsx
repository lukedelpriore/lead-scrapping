import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LeftRail, BottomBar } from "@/components/nav";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Shell for every signed in page. Left rail on desktop, bottom bar on phone,
 * a top bar with the signed in user, and the brand footer. Section 9, 10.6.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="dph-shell">
      <LeftRail />
      <div className="dph-main">
        <header className="dph-topbar">
          <span className="label">Operations console</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="mono" style={{ color: "var(--muted)" }}>
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="dph-content">{children}</main>
        <footer className="dph-footer">Del Priore Hospitality</footer>
      </div>
      <BottomBar />
    </div>
  );
}
