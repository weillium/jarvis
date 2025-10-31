type Props = { params: { eventId: string } };

export default function LiveEventPage({ params }: Props) {
  return (
    <main>
      <h3 style={{ margin: "8px 0" }}>Live Event</h3>
      <p><strong>eventId:</strong> {params.eventId}</p>
      <p style={{ marginTop: 12 }}>
        This is a minimal live page; hook up realtime cards later.
      </p>
    </main>
  );
}