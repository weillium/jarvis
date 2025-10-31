import Link from "next/link";

export const metadata = {
  title: "Context Agents – Local",
  description: "Minimal scaffold with route groups",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui" }}>
        <div style={{ padding: "16px" }}>
          <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <strong>🏗️ Scaffold</strong>
            <nav style={{ display: "flex", gap: 12 }}>
              <Link href="/">Home</Link>
              <Link href="/">App</Link>
              <Link href="/events">Events</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}