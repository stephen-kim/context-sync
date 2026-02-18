import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container-docs">
      <section className="panel">
        <div className="panel-body space-y-3">
          <h1 className="title">Page Not Found</h1>
          <p className="subtitle">The document path does not exist.</p>
          <Link href="/" className="button-link no-underline">
            Back to Docs Home
          </Link>
        </div>
      </section>
    </main>
  );
}
