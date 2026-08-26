import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@dph/db";
import { authConfig } from "./auth.config";
import { isAllowed } from "./lib/allowlist";
import { checkLoginRate, clearLoginRate } from "./lib/rate-limit";

/**
 * Full auth setup (Node runtime). Two providers:
 *  - Credentials, seeded from the two users so the app works before OAuth.
 *  - Google OAuth, restricted to ALLOWED_EMAILS.
 * httpOnly cookie sessions, 7 day expiry (from authConfig), login rate limited.
 */
const googleId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const providers: Provider[] = [
  Credentials({
    name: "Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const email = String(credentials?.email ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!email || !password) return null;

      // Rate limit per IP.
      const ip =
        request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const rate = checkLoginRate(ip);
      if (!rate.allowed) return null;

      if (!isAllowed(email)) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      clearLoginRate(ip);
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    },
  }),
];

if (googleId && googleSecret) {
  providers.push(
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Google sign in is restricted to the allowlist.
      if (account?.provider === "google") {
        return isAllowed(user.email);
      }
      return true;
    },
  },
});
