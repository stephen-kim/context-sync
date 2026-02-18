import Link from 'next/link';
import { getFeaturedDocs, getNavSections } from '../lib/docs';

export default function DocsHomePage() {
  const featured = getFeaturedDocs();
  const sections = getNavSections();

  return (
    <main className="container-docs space-y-6">
      <section className="panel">
        <div className="panel-body space-y-3">
          <h1 className="title">Claustrum Documentation</h1>
          <p className="subtitle">
            Replaces GitHub Wiki with a versioned docs site. Content is generated from repository docs
            and published via GitHub Pages.
          </p>
          <div className="flex flex-wrap gap-2">
            {featured.map((item) => (
              <Link key={item.href} href={item.href} className="button-link no-underline">
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <article key={section.title} className="panel">
            <div className="panel-body space-y-3">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <ul className="grid gap-1 text-sm">
                {section.items.slice(0, 12).map((item) => (
                  <li key={`${section.title}:${item.href}`}>
                    <Link href={item.href} className="no-underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
