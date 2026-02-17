import { IntegrationProvider } from '@prisma/client';

export function toLockedIntegrationProviders(
  values: readonly string[]
): ReadonlySet<IntegrationProvider> {
  const providers = new Set<IntegrationProvider>();
  for (const value of values) {
    if (value === 'notion') {
      providers.add(IntegrationProvider.notion);
      continue;
    }
    if (value === 'jira') {
      providers.add(IntegrationProvider.jira);
      continue;
    }
    if (value === 'confluence') {
      providers.add(IntegrationProvider.confluence);
      continue;
    }
    if (value === 'linear') {
      providers.add(IntegrationProvider.linear);
      continue;
    }
    if (value === 'slack') {
      providers.add(IntegrationProvider.slack);
      continue;
    }
    if (value === 'audit_reasoner') {
      providers.add(IntegrationProvider.audit_reasoner);
    }
  }
  return providers;
}
