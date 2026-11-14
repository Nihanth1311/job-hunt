"use client";

import { useTransition } from "react";
import { deleteResumeVersion } from "@/server/actions/resumes";
import { Icon, buttonClass } from "../ui";

/** Delete one resume for good, after asking. Its PDF goes with it. */
export function DeleteResumeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={buttonClass("danger", "sm")}
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete “${name}” for good? This can't be undone.`)) start(() => deleteResumeVersion(id));
      }}
    >
      <Icon name="trash" className="size-3.5" /> {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
