import { cx } from "./ui";

/** Someone's Google photo, or their initials on a warm tone picked from their name. */
export function Avatar({ name, image, size = 32, className }: { name: string; image: string | null; size?: number; className?: string }) {
  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (image) {
    // Google photos are tiny and already sized; a plain <img> avoids configuring remote image hosts.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" referrerPolicy="no-referrer" style={style} className={cx("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span style={style} className={cx("grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-ink", className)}>
      {initials}
    </span>
  );
}
