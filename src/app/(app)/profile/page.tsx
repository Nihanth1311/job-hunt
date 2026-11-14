import type { Metadata } from "next";
import { ApplicationAnswers } from "@/client/components/profile/application-answers";
import { ProfileForm } from "@/client/components/profile/profile-form";
import { PageHeader } from "@/client/components/ui";
import { requireUser } from "@/server/auth";
import { getAnswerBank, getProfile } from "@/server/services/settings";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { id: uid } = await requireUser();
  const [profile, bank] = await Promise.all([getProfile(uid), getAnswerBank(uid)]);
  return (
    <>
      <PageHeader title="Profile" subtitle="About you, your skills and your master resume. Everything here stays in your own database." />
      <ProfileForm profile={profile} />
      <div className="mt-5">
        <ApplicationAnswers bank={bank} />
      </div>
    </>
  );
}
