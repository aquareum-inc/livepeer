import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@livepeer/api-client", "@livepeer/config", "@livepeer/db", "@livepeer/operator-console", "@livepeer/ui", "@livepeer/user-app"],
  // The instance's secrets live in one root .env for the app and the Compose bundle alike.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // Lets Next.js hand security upgrades to a coding agent (`next upgrade --agent=security`).
  experimental: { agentUpgrade: "security" },
};

export default config;
