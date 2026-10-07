import { Assistant } from "@/components/assistant";
import { firstName } from "@/components/people";
import { AutoRefresh, Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [proposed, suggestions, keys] = await Promise.all([
    db.task.count({ where: { status: "proposed" } }),
    db.suggestion.count({ where: { status: "open" } }),
    db.aiKey.count({ where: { userId: user.id } }),
  ]);
  return (
    <Shell user={user} reviewCount={proposed + suggestions}>
      {children}
      <AutoRefresh />
      <Assistant hasKey={keys > 0} color={user.color} firstName={firstName(user)} />
    </Shell>
  );
}
