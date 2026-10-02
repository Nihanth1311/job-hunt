import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/settings";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { id: uid } = await requireUser();
  const profile = await getProfile(uid);
  return (
    <>
      <PageHeader title="Profile" subtitle="About you, your skills and your master resume. Everything here stays in your own database." />
      <ProfileForm profile={profile} />
    </>
  );
}
