"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/learn", label: "Course" },
  { href: "/playground", label: "Playground" },
  { href: "/resources", label: "Resources" },
  { href: "/progress", label: "My progress" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900 dark:text-white">
      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 font-mono text-sm font-bold text-amber-300 shadow-sm">
        Py
      </span>
      <span>PyPath</span>
    </Link>
  );
}

export function SiteHeader({ account }: { account?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden md:block">{account}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm size-8 p-0 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-zinc-200 px-4 py-2 md:hidden dark:border-zinc-800" aria-label="Mobile">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                isActive(item.href) ? "bg-zinc-100 dark:bg-zinc-800" : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="px-3 py-2" onClick={() => setOpen(false)}>
            {account}
          </div>
        </nav>
      )}
    </header>
  );
}
