export default function AppShellLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <section style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 8 }}>
        <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>⚙️ App Shell</strong>
          <nav style={{ display: "flex", gap: 12 }}>
            <a href="/(app)">Home</a>
            <a href="/(app)/events">Events</a>
          </nav>
        </header>
        {children}
      </section>
    );
  }