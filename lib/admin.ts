import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth, type Session } from "@/lib/auth";
import { pool } from "@/lib/db";

/**
 * Admins are the accounts whose email is listed in ADMIN_EMAILS (comma-separated).
 * Sign-ups don't verify email addresses, so create the admin account before
 * (or as soon as) you add its address here; nobody else can register it after that.
 */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdmin(session: Session | null): boolean {
  return Boolean(session && adminEmails().has(session.user.email.toLowerCase()));
}

export async function currentSession(): Promise<Session | null> {
  if (!auth) return null;
  return auth.api.getSession({ headers: await headers() });
}

/**
 * For admin pages: signed-out visitors go to the sign-in page, and signed-in
 * people who aren't admins get a 404 (the admin area doesn't advertise itself).
 */
export async function requireAdminPage(returnTo: string): Promise<Session> {
  if (!auth || !pool) notFound();
  const session = await currentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (!isAdmin(session)) notFound();
  return session;
}

/** For admin API routes: the admin's session, or an error response. */
export async function requireAdminApi(): Promise<Session | Response> {
  if (!auth || !pool) return Response.json({ error: "Accounts are not configured" }, { status: 503 });
  const session = await currentSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Not an admin" }, { status: 403 });
  return session;
}
