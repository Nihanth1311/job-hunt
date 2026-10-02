import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/application-detail";
import { Icon, PageHeader, TrackBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getApplication } from "@/lib/queries";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/tracker/[id]">) {
  const { id } = await params;
  const { id: uid } = await requireUser();
  const data = await getApplication(uid, id);
  if (!data) notFound();
  const { app, events, job, resumes } = data;

  return (
    <>
      <Link href="/tracker" className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink">
        <Icon name="arrowLeft" className="size-3.5" /> Tracker
      </Link>
      <PageHeader
        title={app.company}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {app.title}
            <TrackBadge track={app.track} />
            {app.url && (
              <a href={app.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                Job posting <Icon name="external" className="size-3.5" />
              </a>
            )}
          </span>
        }
      />
      <ApplicationDetail
        key={app.updatedAt.toISOString()}
        app={app}
        events={events}
        resumes={resumes}
        jobId={job?.id ?? null}
        description={job?.description ?? ""}
      />
    </>
  );
}
