import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Small self-contained build for Docker / any server.
  output: "standalone",
  // The built-in database runs as WebAssembly and loads its own files at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Never bundle your local database into a build.
  outputFileTracingExcludes: { "*": ["./data/**"] },
  poweredByHeader: false,
  experimental: {
    // "Restore from a backup" uploads your whole export (jobs with full descriptions: ~15 MB
    // and growing). Requests pass through the sign-in proxy, which caps bodies at 10 MB by default.
    proxyClientMaxBodySize: "50mb",
  },
  // Hide the floating "N" dev-tools button; build and runtime errors still show in development.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
