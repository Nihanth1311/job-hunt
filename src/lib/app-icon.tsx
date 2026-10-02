import { ImageResponse } from "next/og";

/** The Home Screen and notification icon: "JH" in the stone-on-terracotta of the site. Full bleed; iOS rounds the corners. */
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c2410c",
          color: "#fff7f2",
          fontSize: size * 0.42,
          fontWeight: 700,
          letterSpacing: -size * 0.02,
        }}
      >
        JH
      </div>
    ),
    { width: size, height: size },
  );
}
