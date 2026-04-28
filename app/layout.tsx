import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

// Inter doubles as both display (weight 600 with tight tracking) and body —
// it's the documented Cal Sans substitute in DESIGN-cal.md.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Noto Sans TC fills CJK glyphs (Inter is Latin-only).
const sansCJK = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-cjk",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "旅遊規劃 — 個人用行程工具",
  description:
    "整合景點、地圖、排程、票卷、AI 行前建議與 PDF 旅遊手冊匯出的個人旅遊規劃工具。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-Hant"
      className={`${sans.variable} ${sansCJK.variable} ${mono.variable}`}
    >
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
