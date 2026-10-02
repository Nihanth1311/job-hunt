// Re-mounts on every navigation, so each page's sections settle in from the top (see .page-enter).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
