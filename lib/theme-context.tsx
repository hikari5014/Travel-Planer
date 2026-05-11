"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "tpz-theme";
const COOKIE_NAME = "tpz-theme";

type Ctx = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function applyDom(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
}

function readSystemPref(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  initialMode,
  children,
}: {
  initialMode?: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? "system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Read from localStorage on mount (overrides cookie if present)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve mode → actual theme + apply to DOM
  useEffect(() => {
    const next = mode === "system" ? readSystemPref() : mode;
    setResolved(next);
    applyDom(next);
  }, [mode]);

  // Listen for system preference changes when mode === "system"
  useEffect(() => {
    if (mode !== "system") return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mq.matches ? "dark" : "light";
      setResolved(next);
      applyDom(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    try {
      document.cookie = `${COOKIE_NAME}=${m};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    } catch {
      /* ignore */
    }
  }, []);

  const cycle = useCallback(() => {
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: "system",
      resolved: "light",
      setMode: () => {},
      cycle: () => {},
    };
  }
  return ctx;
}
