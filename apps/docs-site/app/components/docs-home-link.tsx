'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type RouteLanguage, SUPPORTED_ROUTE_LANGUAGES } from '../../lib/languages';

function resolveRouteLanguage(pathname: string): RouteLanguage {
  const idx = pathname.indexOf('/docs/');
  if (idx < 0) {
    return 'en';
  }

  const rest = pathname.slice(idx + '/docs/'.length).replace(/^\/+|\/+$/g, '');
  if (!rest) {
    return 'en';
  }

  const [first] = rest.split('/');
  if (SUPPORTED_ROUTE_LANGUAGES.includes(first as RouteLanguage) && first !== 'en') {
    return first as RouteLanguage;
  }

  return 'en';
}

function toHomeHref(language: RouteLanguage): string {
  return language === 'en' ? '/docs/home' : `/docs/${language}/home`;
}

export function DocsHomeLink({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const language = resolveRouteLanguage(pathname);

  return (
    <Link href={toHomeHref(language)} className={className}>
      {children}
    </Link>
  );
}
