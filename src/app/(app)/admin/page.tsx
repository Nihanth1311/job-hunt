import type { Metadata } from "next";
import { AdminFeatures } from "@/components/admin-features";
import { PeopleManager } from "@/components/people-manager";
import { PageHeader } from "@/components/ui";
import { listPeople } from "@/lib/accounts";
import { MAX_USERS, requireAdmin } from "@/lib/auth";
import { telegramEnabled } from "@/lib/settings";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [people, telegram] = await Promise.all([listPeople(), telegramEnabled()]);
  return (
    <>
      <PageHeader title="Admin" subtitle={`Who's using Job Hunt (up to ${MAX_USERS} people, Google sign-in only) and features for everyone.`} />
      <div className="mb-5">
        <AdminFeatures telegram={telegram} />
      </div>
      <PeopleManager
        me={admin.email}
        max={MAX_USERS}
        people={people.map((p) => ({
          ...p,
          lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
          lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
