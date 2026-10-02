import type { Metadata } from "next";
import { PeopleManager } from "@/components/people-manager";
import { PageHeader } from "@/components/ui";
import { listPeople } from "@/lib/accounts";
import { MAX_USERS, requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Access" };

export default async function AdminPage() {
  const admin = await requireAdmin();
  const people = await listPeople();
  return (
    <>
      <PageHeader title="Access" subtitle={`Who can use Job Hunt, and who's using it. Up to ${MAX_USERS} people, Google sign-in only.`} />
      <PeopleManager
        me={admin.email}
        max={MAX_USERS}
        people={people.map((p) => ({ ...p, lastLoginAt: p.lastLoginAt?.toISOString() ?? null }))}
      />
    </>
  );
}
