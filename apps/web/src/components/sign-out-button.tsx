import { signOut } from "@/auth";

/** Sign out via a server action form. */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        style={{
          background: "transparent",
          border: "1px solid var(--card-border)",
          color: "var(--ink)",
          padding: "6px 12px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Sign out
      </button>
    </form>
  );
}
