import Link from "next/link";
import { QueryProvider } from '@/shared/providers/query-provider';
import { TamaguiProvider } from '@jarvis/ui-core';

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
        <TamaguiProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </TamaguiProvider>
      </body>
    </html>
  );
}