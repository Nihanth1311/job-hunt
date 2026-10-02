import type { MetadataRoute } from "next";

// Lets the site be added to a phone's Home Screen as an app, which iPhones require for notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Job Hunt",
    short_name: "Job Hunt",
    description: "Private job search dashboard",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f1ee",
    theme_color: "#f3f1ee",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
