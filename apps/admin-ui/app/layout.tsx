import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claustrum Admin',
  description: 'Memory Core admin dashboard',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
