import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// One grotesk for everything (bold and tight for headings), plus a mono for code and keys.
const body = Schibsted_Grotesk({ variable: "--font-body", subsets: ["latin"] });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Job Hunt", template: "%s · Job Hunt" },
  description: "Private job search dashboard",
  // Private site: never show up in search engines.
  robots: { index: false, follow: false, nocache: true },
  // Opens full screen from the iPhone Home Screen (needed there for notifications).
  appleWebApp: { capable: true, title: "Job Hunt", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#171514" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark choice before the first paint, so the page never flashes the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans text-ink">{children}</body>
    </html>
  );
}
