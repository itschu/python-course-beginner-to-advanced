"use client";

import { Moon, Sun } from "lucide-react";

import { useIsDark } from "@/components/use-is-dark";

export const THEME_KEY = "pypath-theme";

/** Runs before the page paints so dark mode doesn't flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export function ThemeToggle() {
  const isDark = useIsDark();
  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-sm size-8 p-0"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
