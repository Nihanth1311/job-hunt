/** Join class names, skipping empty ones: cx("a", cond && "b") → "a b" or "a". */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
