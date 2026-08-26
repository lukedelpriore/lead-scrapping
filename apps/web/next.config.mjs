/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@dph/config", "@dph/db", "@dph/pipeline"],
  eslint: { ignoreDuringBuilds: true },
  // Prisma client and bcryptjs stay external to the server bundle.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
