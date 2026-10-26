import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Payment routes and webhooks require the Next.js server (Vercel / next start).
  agentRules: false,
};

export default nextConfig;
