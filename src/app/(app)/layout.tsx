import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/settings";

// Every page reads live data from the database, for whoever is signed in.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The real sign-in check: a valid, unexpired session in the database (the proxy only looks for the cookie).
  const user = await requireUser();
  // The name on their Profile wins (it's what they chose); then Google's; then their email.
  const name = (await getProfile(user.id)).name.trim() || user.name || user.email.split("@")[0];
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Nav user={{ name, email: user.email, image: user.image, admin: user.role === "admin" }} />
      <main className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:py-9 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
