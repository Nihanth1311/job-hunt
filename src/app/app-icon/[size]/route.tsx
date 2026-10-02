import { appIcon } from "@/lib/app-icon";

const SIZES = [96, 192, 512];

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }));
}

export async function GET(_req: Request, { params }: RouteContext<"/app-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return appIcon(size);
}
