import { AppShellWrapper } from './components/app-shell-wrapper';

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShellWrapper>{children}</AppShellWrapper>;
}