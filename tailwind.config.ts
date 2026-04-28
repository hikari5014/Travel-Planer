import type { Config } from "tailwindcss";

// All tokens map directly to DESIGN-cal.md (Cal.com brand)
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",

      // Primary action color = near-black (Cal.com)
      primary: {
        DEFAULT: "#111111",
        active: "#242424",
        disabled: "#e5e7eb",
      },

      ink: "#111111",
      body: {
        DEFAULT: "#374151",
        strong: "#1f2937",
      },
      muted: {
        DEFAULT: "#6b7280",
        soft: "#898989",
      },

      hairline: {
        DEFAULT: "#e5e7eb",
        soft: "#f3f4f6",
      },

      canvas: "#ffffff",
      surface: {
        soft: "#f8f9fa",
        card: "#f5f5f5",
        strong: "#e5e7eb",
        dark: "#101010",
        "dark-elevated": "#1a1a1a",
        "dark-soft": "#1a1a1a",
      },

      "on-primary": "#ffffff",
      "on-dark": {
        DEFAULT: "#ffffff",
        soft: "#a1a1aa",
      },

      // Cal.com palette: brand-accent blue + 4 pastel badges
      "brand-accent": "#3b82f6",
      badge: {
        orange: "#fb923c",
        pink: "#ec4899",
        violet: "#8b5cf6",
        emerald: "#34d399",
      },

      // Backwards-compat aliases for files still referencing the old tokens.
      // Maps old "accent-teal/amber" into the closest Cal.com pastel so we
      // don't have to rewrite every component in this swap.
      accent: {
        teal: "#34d399",   // → emerald
        amber: "#fb923c",  // → orange
      },

      success: "#10b981",
      warning: "#f59e0b",
      error: "#ef4444",
    },

    fontFamily: {
      // Display = Inter 600 with tight tracking (Cal Sans substitute)
      display: ["var(--font-sans)", "var(--font-sans-cjk)", "Inter", "Noto Sans TC", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      sans: ["var(--font-sans)", "var(--font-sans-cjk)", "Inter", "Noto Sans TC", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
    },

    fontSize: {
      // Cal.com display sizes — Inter 600, negative tracking
      "display-xl": ["64px", { lineHeight: "1.05", letterSpacing: "-2px", fontWeight: "600" }],
      "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-1.5px", fontWeight: "600" }],
      "display-md": ["36px", { lineHeight: "1.15", letterSpacing: "-1px", fontWeight: "600" }],
      "display-sm": ["28px", { lineHeight: "1.2", letterSpacing: "-0.5px", fontWeight: "600" }],
      // Title sizes (Inter 600)
      "title-lg": ["22px", { lineHeight: "1.3", letterSpacing: "-0.3px", fontWeight: "600" }],
      "title-md": ["18px", { lineHeight: "1.4", fontWeight: "600" }],
      "title-sm": ["16px", { lineHeight: "1.4", fontWeight: "600" }],
      // Body
      "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }],
      "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
      caption: ["13px", { lineHeight: "1.4", fontWeight: "500" }],
      "caption-uppercase": ["12px", { lineHeight: "1.4", letterSpacing: "1.5px", fontWeight: "500" }],
      code: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
      button: ["14px", { lineHeight: "1", fontWeight: "600" }],
      "nav-link": ["14px", { lineHeight: "1.4", fontWeight: "500" }],
    },

    borderRadius: {
      none: "0",
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "12px",
      xl: "16px",
      pill: "9999px",
      full: "9999px",
    },

    spacing: {
      0: "0",
      px: "1px",
      xxs: "4px",
      xs: "8px",
      sm: "12px",
      md: "16px",
      lg: "24px",
      xl: "32px",
      xxl: "48px",
      section: "96px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      8: "32px",
      10: "40px",
      12: "48px",
      14: "56px",
      16: "64px",
      20: "80px",
      24: "96px",
      32: "128px",
    },

    extend: {
      maxWidth: { content: "1200px" },
      boxShadow: {
        "soft-elevation": "0 1px 2px rgba(17,17,17,0.04), 0 4px 12px rgba(17,17,17,0.06)",
        "pop": "0 8px 24px rgba(17,17,17,0.10), 0 2px 6px rgba(17,17,17,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
