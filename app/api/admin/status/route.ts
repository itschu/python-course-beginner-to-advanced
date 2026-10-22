import { currentSession, isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** Whether the signed-in person is an admin, so the account menu can show the Admin link. */
export async function GET() {
  return Response.json({ admin: isAdmin(await currentSession()) });
}
