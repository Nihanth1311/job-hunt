"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { addPushSub, removePushSub, sendPush, setPushMode, type PushMode } from "@/lib/notify/push";

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** Turn notifications on for this device. `sub` is the browser's PushSubscription as JSON. */
export async function subscribePush(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }, device: string) {
  const { id: uid } = await requireUser();
  const { endpoint, keys } = sub ?? {};
  if (!isText(endpoint, 1000) || !endpoint.startsWith("https://") || !isText(keys?.p256dh, 200) || !isText(keys?.auth, 100)) {
    return { ok: false };
  }
  await addPushSub(uid, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, device: String(device).slice(0, 60) });
  revalidatePath("/settings");
  return { ok: true };
}

export async function unsubscribePush(endpoint: string) {
  const { id: uid } = await requireUser();
  await removePushSub(uid, String(endpoint));
  revalidatePath("/settings");
}

export async function savePushMode(mode: PushMode) {
  const { id: uid } = await requireUser();
  await setPushMode(uid, mode === "ready" ? "ready" : "worth");
  revalidatePath("/settings");
}

export async function testPush(): Promise<string> {
  const { id: uid } = await requireUser();
  const n = await sendPush(uid, {
    title: "Job Hunt notifications are on",
    body: "You'll get one after every automatic fetch, and when your own Fetch now finishes.",
    url: "/jobs",
  });
  return n ? `Sent to ${n} device${n > 1 ? "s" : ""}.` : "No device got it. Turn notifications off and on again on your phone.";
}
