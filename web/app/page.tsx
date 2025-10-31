export default function LandingPage() {
  return (
    <main>
      <h1 style={{ margin: "8px 0" }}>Public Landing</h1>
      <p style={{ marginBottom: 12 }}>
        This is a minimal public page. Use the nav to open the app shell.
      </p>
      <ul>
        <li><a href="/(app)">Open App</a></li>
        <li><a href="/(app)/events">View Events</a></li>
      </ul>
    </main>
  );
}