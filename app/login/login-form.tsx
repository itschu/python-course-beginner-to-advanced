"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/providers";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/progress";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.user) {
    return (
      <div className="card p-6 text-center">
        <p className="text-zinc-700 dark:text-zinc-300">
          You&apos;re signed in as <strong>{auth.user.email}</strong>.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => router.push(next)}>
          Continue
        </button>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      const fallback =
        result.error.status === 401
          ? "Wrong email or password."
          : result.error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Something went wrong. Please try again.";
      setError(result.error.message || fallback);
      return;
    }
    router.push(next);
  };

  return (
    <div className="card p-6">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-md py-1.5 font-medium ${
              mode === m ? "bg-white shadow-sm dark:bg-zinc-900" : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {auth.github && (
        <>
          <button
            type="button"
            className="btn btn-outline w-full"
            onClick={() => authClient.signIn.social({ provider: "github", callbackURL: next })}
          >
            Continue with GitHub
          </button>
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or with email
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</span>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {mode === "signup" && <span className="mt-1 block text-xs text-zinc-500">At least 8 characters.</span>}
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-xs text-zinc-500">
        Progress you made before signing in is added to your account automatically.
      </p>
    </div>
  );
}
