import type { Metadata } from "next";
import { AdminFeatures } from "@/client/components/admin/admin-features";
import { PeopleManager } from "@/client/components/admin/people-manager";
import { PageHeader } from "@/client/components/ui";
import { listPeople } from "@/server/services/accounts";
import { MAX_USERS, requireAdmin } from "@/server/auth";
import { telegramEnabled } from "@/server/services/settings";

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
