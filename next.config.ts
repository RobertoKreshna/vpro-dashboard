import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = supabase ? new URL(supabase).host : "";

/**
 * Content-Security-Policy. Next.js needs inline scripts for hydration (nonce-based CSP would make every page dynamic),
 * so script-src allows 'unsafe-inline'; everything else is locked to this site + the Supabase project.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseHost ? `https://${supabaseHost}` : ""}`.trim(),
  `connect-src 'self' ${supabaseHost ? `https://${supabaseHost} wss://${supabaseHost}` : ""}${isProd ? "" : " ws: wss:"}`.trim(),
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The dev badge covers buttons in the corners on phone-sized windows (sign out, card actions).
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Boundary tiles change only when `bun run geo:build` is re-run, so let browsers and CDNs reuse them for a day.
      { source: "/geo/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
