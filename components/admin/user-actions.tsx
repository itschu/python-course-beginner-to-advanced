"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
}

/** Enrol a learner in an elective, or remove them. */
export function ElectiveToggle({ userId, slug, enrolled }: { userId: string; slug: string; enrolled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`btn btn-sm ${enrolled ? "btn-outline" : "btn-primary"}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await send(`/api/admin/users/${encodeURIComponent(userId)}/electives`, enrolled ? "DELETE" : "POST", { slug });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : enrolled ? "Remove" : "Enrol"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}

/** Permanently delete an account. Asks for the email address to be typed, so it can't happen by accident. */
export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn btn-danger"
        disabled={busy}
        onClick={async () => {
          const typed = window.prompt(`This permanently deletes the account, its progress and its saved code.\n\nType ${email} to confirm.`);
          if (typed?.trim().toLowerCase() !== email.toLowerCase()) return;
          setBusy(true);
          setError(null);
          try {
            await send(`/api/admin/users/${encodeURIComponent(userId)}`, "DELETE");
            router.push("/admin/users");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <Trash2 className="size-4" aria-hidden /> {busy ? "Deleting…" : "Delete account"}
      </button>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
