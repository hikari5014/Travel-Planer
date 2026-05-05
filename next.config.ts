import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
    ],
  },
  // Phase 14k — pdf-document.tsx loads Noto Sans TC woff files from
  // node_modules at render time. On Vercel the trace doesn't auto-include
  // them, so we tell next to bundle the @fontsource/noto-sans-tc files
  // alongside the routes that import the PDF service.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-700-normal.woff",
    ],
    "/trips/**/*": [
      "./node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-700-normal.woff",
    ],
  },
};

export default nextConfig;
