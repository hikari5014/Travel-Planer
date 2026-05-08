import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider, type ThemeMode } from "@/lib/theme-context";

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
  title: "Travel Planner Z · 旅遊規劃Z",
  description:
    "整合景點、地圖、排程、票卷、AI 行前建議與 PDF 旅遊手冊匯出的個人旅遊規劃Z。",
};

// Read cookie on server so initial paint matches user's stored preference and
// avoids the dark→light flash. The inline <script> further refines this by
// reading localStorage (which may be more recent than the cookie).
async function readInitialMode(): Promise<ThemeMode> {
  try {
    const store = await cookies();
    const c = store.get("tpz-theme")?.value;
    if (c === "light" || c === "dark" || c === "system") return c;
  } catch {
    /* ignore */
  }
  return "system";
}

const FOUC_SCRIPT = `(function(){try{var s=localStorage.getItem('tpz-theme')||document.cookie.split('; ').find(function(c){return c.indexOf('tpz-theme=')===0;});var m=s&&s.indexOf('=')>-1?s.split('=')[1]:s;if(!m||(m!=='light'&&m!=='dark'&&m!=='system'))m='system';var resolved=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;document.documentElement.dataset.theme=resolved;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialMode = await readInitialMode();
  return (
    <html
      lang="zh-Hant"
      className={`${sans.variable} ${sansCJK.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink antialiased">
        <ThemeProvider initialMode={initialMode}>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
