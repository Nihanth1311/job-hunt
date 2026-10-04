"use client";

import { useState } from "react";

export const DEFAULT_CLAUDE_URL = "https://claude.ai/new";

export function safeClaudeUrl(url: string | undefined): string {
  return url && /^https:\/\/claude\.ai\//.test(url.trim()) ? url.trim() : DEFAULT_CLAUDE_URL;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export type SendState = "idle" | "copied" | "failed";

/**
 * Copy a message to the clipboard and open Claude in a new tab.
 * The message never goes into the URL, so the job and your resume stay out of
 * browser history and logs. In Claude: Ctrl+V, then Enter.
 */
export function useSendToClaude(claudeUrl: string | undefined) {
  const [state, setState] = useState<SendState>("idle");
  const url = safeClaudeUrl(claudeUrl);

  const send = (message: string, open = true) => {
    const copied = copyText(message); // start the copy inside the click, before focus moves to the new tab
    if (open) window.open(url, "_blank", "noopener,noreferrer");
    copied.then((ok) => setState(ok ? "copied" : "failed"));
  };

  return { send, state, reset: () => setState("idle") };
}
