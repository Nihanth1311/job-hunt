import type { Metadata } from "next";
import { addApplication } from "@/server/actions/applications";
import { TrackerBoard } from "@/client/components/tracker/tracker-board";
import { buttonClass, Card, cx, Icon, PageHeader } from "@/client/components/ui";
import { requireUser } from "@/server/auth";
import { listApplications } from "@/server/services/queries";
import { APP_STATUSES, STATUS_LABEL, TRACK_LABEL, TRACKS } from "@/shared/types";

export const metadata: Metadata = { title: "Tracker" };

export default async function TrackerPage() {
  const { id: uid } = await requireUser();
  const applications = await listApplications(uid);
  const active = applications.filter((a) => ["applied", "assessment", "interview"].includes(a.status)).length;

  return (
    <>
      <PageHeader
        title="Tracker"
        subtitle={`${applications.length} total · ${active} in progress`}
      />

      <details className="group mb-5">
        <summary className={cx(buttonClass("secondary"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
          <Icon name="plus" className="transition group-open:rotate-45" /> Add an application
        </summary>
        <Card className="mt-3 p-5">
          <form action={addApplication} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="company">Company</label>
              <input id="company" name="company" required className="field" />
            </div>
            <div>
              <label className="label" htmlFor="title">Role</label>
              <input id="title" name="title" required className="field" />
            </div>
            <div>
              <label className="label" htmlFor="url">Link</label>
              <input id="url" name="url" className="field" placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="track">Resume used</label>
              <select id="track" name="track" className="field" defaultValue="fullstack">
                {TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {TRACK_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="status">Status</label>
              <select id="status" name="status" className="field" defaultValue="applied">
                {APP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className={cx(buttonClass("primary"), "w-full sm:w-auto")}>Add application</button>
            </div>
          </form>
        </Card>
      </details>

      <TrackerBoard applications={applications} />
    </>
  );
}
