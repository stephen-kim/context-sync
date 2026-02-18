import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAllDocs, getDocBySegments, getDocParams, getNavSections } from '../../../lib/docs';

type Props = {
  params: { slug: string[] };
};

export function generateStaticParams() {
  return getDocParams();
}

export function generateMetadata({ params }: Props): Metadata {
  const doc = getDocBySegments(params.slug);
  if (!doc) {
    return { title: 'Document Not Found | Claustrum Docs' };
  }
  return {
    title: `${doc.title} | Claustrum Docs`,
    description: `Documentation page: ${doc.title}`,
  };
}

export default function DocPage({ params }: Props) {
  const doc = getDocBySegments(params.slug);
  if (!doc) {
    notFound();
  }

  const sections = getNavSections();
  const sameLang = getAllDocs().filter((item) => item.lang === doc.lang);

  return (
    <main className="container-docs grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="panel hidden h-fit lg:block">
        <div className="panel-body space-y-4 text-sm">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
              <ul className="space-y-1">
                {section.items
                  .filter((item) => (doc.lang === 'ko' ? item.href.startsWith('/docs/ko/') : !item.href.startsWith('/docs/ko/')))
                  .slice(0, 14)
                  .map((item) => (
                    <li key={`${section.title}:${item.href}`}>
                      <Link href={item.href} className="no-underline">
                        {item.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      <section className="panel">
        <div className="panel-body space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="title">{doc.title}</h1>
              <p className="subtitle">
                {doc.lang === 'ko' ? 'Korean document' : 'English document'} · Source: {doc.fileName}
              </p>
            </div>
            <div className="flex gap-2">
              <Link className="button-link no-underline" href="/">
                Docs Home
              </Link>
            </div>
          </div>

          <article className="prose-docs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
          </article>

          <footer className="border-t border-border pt-4">
            <p className="subtitle mb-2">More {doc.lang === 'ko' ? 'Korean' : 'English'} pages</p>
            <div className="flex flex-wrap gap-2">
              {sameLang.slice(0, 12).map((item) => (
                <Link key={item.id} href={item.href} className="button-link no-underline">
                  {item.title}
                </Link>
              ))}
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
