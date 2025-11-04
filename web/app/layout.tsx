import Link from "next/link";

export const metadata = {
  title: "Jarvis – Intelligent Event Context",
  description: "Real-time AI-powered context agents for academic events and conferences",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}