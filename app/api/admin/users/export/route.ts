import { requireAdminApi } from "@/lib/admin";
import { listUsers } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

/** Quote a CSV cell, and defuse values a spreadsheet would run as a formula. */
function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Every user, as CSV. */
export async function GET() {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;
  const { users } = await listUsers("", 1, 100_000);
  const header = ["name", "email", "joined", "last_active", "lessons_completed", "exercises_passed", "electives"];
  const lines = users.map((u) =>
    [
      u.name,
      u.email,
      u.createdAt.toISOString(),
      u.lastActive?.toISOString() ?? "",
      u.lessonsCompleted,
      u.exercisesPassed,
      u.electives.join(" "),
    ]
      .map(cell)
      .join(","),
  );
  return new Response([header.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pypath-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
