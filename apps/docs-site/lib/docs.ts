import fs from 'node:fs';
import path from 'node:path';

export type DocLanguage = 'en' | 'ko';

export type DocItem = {
  id: string;
  fileName: string;
  title: string;
  slugBase: string;
  href: string;
  lang: DocLanguage;
  body: string;
};

export type NavSection = {
  title: string;
  items: Array<Pick<DocItem, 'title' | 'href'>>;
};

const DOCS_DIR = path.resolve(process.cwd(), '../../docs/content');

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stripLangSuffix(rawName: string): { baseName: string; lang: DocLanguage } {
  if (rawName.endsWith('.ko')) {
    return { baseName: rawName.slice(0, -3), lang: 'ko' };
  }
  return { baseName: rawName, lang: 'en' };
}

function toHref(rawName: string): string {
  const { baseName, lang } = stripLangSuffix(rawName);
  const slugBase = slugify(baseName);
  return lang === 'ko' ? `/docs/ko/${slugBase}` : `/docs/${slugBase}`;
}

function mapTitle(content: string, fallback: string): string {
  const heading = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));

  if (heading) {
    return heading.slice(2).trim();
  }

  return fallback;
}

function replaceWikiLinks(markdown: string): string {
  const withWikiLinks = markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = String(rawTarget || '').trim();
    const label = String(rawLabel || target).trim();
    const href = toHref(target);
    return `[${label}](${href})`;
  });

  return withWikiLinks.replace(/\]\(([^)]+)\)/g, (full, rawTarget) => {
    const target = String(rawTarget || '').trim();

    if (
      !target ||
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:') ||
      target.startsWith('#') ||
      target.startsWith('/')
    ) {
      return full;
    }

    const clean = target.replace(/\.md$/i, '');
    if (/^[A-Za-z0-9._-]+$/.test(clean)) {
      return `](${toHref(clean)})`;
    }

    return full;
  });
}

function readDoc(fileName: string): DocItem | null {
  if (!fileName.endsWith('.md') || fileName.startsWith('_')) {
    return null;
  }

  const filePath = path.join(DOCS_DIR, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const withoutExt = fileName.replace(/\.md$/i, '');
  const { baseName, lang } = stripLangSuffix(withoutExt);
  const slugBase = slugify(baseName);
  const title = mapTitle(raw, baseName);

  return {
    id: `${lang}:${slugBase}`,
    fileName,
    title,
    slugBase,
    href: lang === 'ko' ? `/docs/ko/${slugBase}` : `/docs/${slugBase}`,
    lang,
    body: replaceWikiLinks(raw),
  };
}

export function getAllDocs(): DocItem[] {
  const fileNames = fs.readdirSync(DOCS_DIR);
  return fileNames
    .map(readDoc)
    .filter((item): item is DocItem => Boolean(item))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getDocBySegments(segments: string[]): DocItem | null {
  const docs = getAllDocs();

  const normalized = segments.filter(Boolean);
  const lang: DocLanguage = normalized[0] === 'ko' ? 'ko' : 'en';
  const slug = lang === 'ko' ? normalized.slice(1).join('/') : normalized.join('/');

  if (!slug) {
    return null;
  }

  return docs.find((doc) => doc.lang === lang && doc.slugBase === slug) || null;
}

export function getDocParams(): Array<{ slug: string[] }> {
  const docs = getAllDocs();
  return docs.map((doc) => ({
    slug: doc.lang === 'ko' ? ['ko', doc.slugBase] : [doc.slugBase],
  }));
}

export function getNavSections(): NavSection[] {
  const sidebarPath = path.join(DOCS_DIR, '_Sidebar.md');
  if (!fs.existsSync(sidebarPath)) {
    return [];
  }

  const lines = fs.readFileSync(sidebarPath, 'utf8').split('\n');
  const sections: NavSection[] = [];
  let current: NavSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), items: [] };
      sections.push(current);
      continue;
    }

    const link = line.match(/^-\s+\[\[([^\]]+)\]\]$/);
    if (link && current) {
      const name = link[1].trim();
      current.items.push({
        title: name.replace(/\.ko$/i, ''),
        href: toHref(name),
      });
    }
  }

  return sections.filter((section) => section.items.length > 0);
}

export function getFeaturedDocs(): Array<Pick<DocItem, 'title' | 'href'>> {
  const priorities = ['Home', 'Installation', 'Environment-Variables', 'ci', 'release-gate'];
  return priorities.map((name) => ({ title: name, href: toHref(name) }));
}
