import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

/**
 * Login page. Password sign in is the seeded fallback so the app is usable
 * before Google OAuth is configured. Sentence case, no exclamation marks.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/dashboard",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw err;
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ padding: 28, width: "100%", maxWidth: 380 }}>
        <div className="display-md" style={{ marginBottom: 4 }}>
          Lead Engine
        </div>
        <p className="label" style={{ marginBottom: 20 }}>
          Sign in to continue
        </p>

        {error ? (
          <div
            role="alert"
            style={{
              background: "#fbeeec",
              border: "1px solid var(--error)",
              color: "var(--error)",
              padding: "10px 12px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            That email or password did not match. Check both and try again.
          </div>
        ) : null}

        <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            style={{
              marginTop: 4,
              background: "var(--navy)",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </form>

        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          Access is limited to the allowlist.
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--card-border)",
  borderRadius: 8,
  padding: "9px 11px",
  fontSize: 15,
  background: "#fff",
};
