import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` refuses to serve its own assets to an origin it was not started
   * with, which silently leaves client components unhydrated when the site is
   * previewed over Cursor's port-forwarding host instead of localhost. No
   * effect on `next build`.
   */
  allowedDevOrigins: ["**.agent.cvm.dev"],
};

export default nextConfig;
