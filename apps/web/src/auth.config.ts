import type { NextAuthConfig } from "next-auth";

/**
 * Edge safe base auth config. Shared by the middleware (edge) and the full
 * auth setup (Node). No bcrypt or Prisma here so the middleware bundle stays
 * edge compatible.
 */
export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLogin = nextUrl.pathname.startsWith("/login");
      const isPublic =
        nextUrl.pathname.startsWith("/api/health") ||
        nextUrl.pathname.startsWith("/api/auth");
      if (isPublic) return true;
      if (isLogin) {
        // Signed in users skip the login page.
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "operator";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role =
          (token.role as string) ?? "operator";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
