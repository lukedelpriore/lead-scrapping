/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@dph/config", "@dph/db", "@dph/pipeline"],
  eslint: { ignoreDuringBuilds: true },
  // Server only packages kept out of the bundle.
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "googleapis",
    "@anthropic-ai/sdk",
    "pino",
  ],
};

export default nextConfig;
