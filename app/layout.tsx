import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "katex/dist/katex.min.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { themeScript } from "@/components/theme-toggle";
import { githubUrl, site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${site.name} · Python to Machine Learning`, template: `%s · ${site.name}` },
  description: site.tagline,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-200 py-8 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4">
              <p className="m-0">
                {site.name}: learn Python, data science, machine learning and backend development by writing real code.
              </p>
              <div className="flex gap-4">
                <Link href="/resources" className="hover:text-zinc-900 dark:hover:text-white">
                  Resources
                </Link>
                <a href={githubUrl("README.md")} className="hover:text-zinc-900 dark:hover:text-white" target="_blank" rel="noreferrer">
                  Source on GitHub
                </a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
