import Link from "next/link";
import { SpikeMark } from "@/components/brand/SpikeMark";

const navItems = [
  { label: "我的旅程", href: "/" },
  { label: "範本", href: "#" },
  { label: "用量", href: "/settings#usage" },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline-soft bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-content items-center gap-lg px-lg">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-xs">
          <SpikeMark size={16} className="text-ink" />
          <span className="text-title-sm tracking-tight text-ink">旅遊規劃Z</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden flex-1 items-center gap-xs md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-nav-link text-muted transition-colors hover:bg-surface-card hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster — minimal, app-like */}
        <div className="ml-auto flex items-center gap-xs">
          <Link
            href="/settings"
            aria-label="設定"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-card hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <button
            aria-label="個人"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-card text-caption text-ink transition-colors hover:bg-surface-cream-strong"
          >
            我
          </button>
        </div>
      </div>
    </header>
  );
}
