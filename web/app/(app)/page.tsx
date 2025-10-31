export default function AppHome() {
    return (
      <main>
        <h2 style={{ margin: "8px 0" }}>App Dashboard</h2>
        <p style={{ marginBottom: 12 }}>
          Minimal placeholder inside the (app) route group.
        </p>
        <ul>
          <li><a href="/(app)/events">Go to Events</a></li>
        </ul>
      </main>
    );
  }