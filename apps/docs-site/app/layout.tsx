import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Claustrum Docs',
  description: 'Claustrum documentation site',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <header className="border-b border-border/70 bg-background/70 backdrop-blur">
          <div className="container-docs flex items-center justify-between gap-3 py-4">
            <div>
              <Link href="/" className="text-lg font-semibold text-foreground no-underline">
                Claustrum Docs
              </Link>
              <p className="subtitle">GitHub Pages documentation for Claustrum</p>
            </div>
            <div className="flex items-center gap-2">
              <Link className="button-link no-underline" href="/docs/home">
                English
              </Link>
              <Link className="button-link no-underline" href="/docs/ko/home">
                한국어
              </Link>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
