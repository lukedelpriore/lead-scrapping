import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Edge middleware for route protection. Uses only the edge safe base config
 * so no bcrypt or Prisma is pulled into the edge bundle.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // authConfig.callbacks.authorized handles the decision.
  void req;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
