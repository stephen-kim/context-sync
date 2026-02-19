import { getSidebarGroups } from '../../lib/docs';
import { type RouteLanguage } from '../../lib/languages';
import { DocsSidebarClient } from './docs-sidebar-client';

export function DocsSidebar({ lang, currentHref }: { lang: RouteLanguage; currentHref: string }) {
  const groups = getSidebarGroups(lang);

  return <DocsSidebarClient groups={groups} currentHref={currentHref} />;
}
