import type { Metadata } from "next";
import { ApplicationAnswers } from "@/client/components/profile/application-answers";
import { ProfileForm } from "@/client/components/profile/profile-form";
import { PageHeader } from "@/client/components/ui";
import { requireUser } from "@/server/auth";
import { getAnswerBank, getProfile } from "@/server/services/settings";
import { getBaseResumes } from "@/server/services/queries";
import { suggestFromResume } from "@/shared/autofill";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { id: uid } = await requireUser();
  const [profile, bank, bases] = await Promise.all([getProfile(uid), getAnswerBank(uid), getBaseResumes(uid)]);
  // Suggestions for empty answers: from your master resume, else your newest base resume.
  const newestBase = Object.values(bases).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const suggestions = suggestFromResume(profile.masterResume.trim() || newestBase?.content || "");
  return (
    <>
      <PageHeader title="Profile" subtitle="About you, your skills and your master resume. Everything here stays in your own database." />
      <ProfileForm profile={profile} />
      <div className="mt-5">
        <ApplicationAnswers bank={bank} suggestions={suggestions} />
      </div>
    </>
  );
}
