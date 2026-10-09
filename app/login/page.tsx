import type { Metadata } from "next";
import { Suspense } from "react";

import { authStatus } from "@/lib/auth-status";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const status = authStatus();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-center text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">Your account</h1>
      <p className="mt-2 mb-8 text-center text-zinc-600 dark:text-zinc-400">
        Sign in to save your progress and code to the cloud and pick up on any device.
      </p>
      {status.enabled ? (
        <Suspense>
          <LoginForm />
        </Suspense>
      ) : (
        <div className="card p-6 text-sm text-zinc-700 dark:text-zinc-300">
          <p className="font-medium text-zinc-900 dark:text-white">Accounts aren&apos;t switched on for this site yet.</p>
          <p className="mt-2">
            Your progress is still saved in this browser, and you can move it between browsers with Export/Import on the
            My progress page.
          </p>
          <p className="mt-2">
            To enable accounts, add a Postgres database and set <code>DATABASE_URL</code> and{" "}
            <code>BETTER_AUTH_SECRET</code>. The README explains each step.
          </p>
        </div>
      )}
    </div>
  );
}
