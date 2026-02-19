import { redirect } from 'next/navigation';

function resolveApiExplorerHref(): string {
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  return `${basePath}/api-explorer.html`;
}

export default function ApiExplorerRedirectPage() {
  redirect(resolveApiExplorerHref());
}
