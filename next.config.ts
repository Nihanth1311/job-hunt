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
          // Browsers that have seen the site once use HTTPS for it from then on (ignored over plain http, e.g. localhost).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // The site uses none of these device features, so no script on it may ask for them.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          // A window this site opens (or that opened it) gets no handle on it.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Limits that hold even if some page were tricked into showing injected markup: no
          // framing, no <base> rewriting links, no plugins, and forms may post only to this site
          // (and to Overleaf, for "Open in Overleaf").
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://www.overleaf.com" },
        ],
      },
      {
        // The notification worker: always re-checked, so fixes reach phones straight away.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
