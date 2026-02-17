type SecuritySeverity = 'low' | 'medium' | 'high';
type SecurityCategory = 'auth' | 'access' | 'data' | 'config';

const SECURITY_ACTION_PREFIXES = [
  'auth.',
  'access.',
  'api_key.',
  'oidc.',
  'github.permissions.',
  'security.',
] as const;

const SECURITY_ACTION_EXACT = new Set(['raw.search', 'raw.view', 'audit.export']);

export type SecurityClassification = {
  isSecurityEvent: boolean;
  severity: SecuritySeverity;
  category: SecurityCategory;
};

export function resolveSecurityClassification(args: {
  action: string;
  target?: Record<string, unknown> | null;
}): SecurityClassification {
  const action = String(args.action || '').trim();
  const target = args.target || {};
  const fromTargetSeverity = parseSeverity(target.severity);
  const fromTargetCategory = parseCategory(target.category);

  const isSecurityAction = isSecurityRelevantAction(action);
  const inferred = inferByAction(action);

  return {
    isSecurityEvent: isSecurityAction,
    severity: fromTargetSeverity || inferred.severity,
    category: fromTargetCategory || inferred.category,
  };
}

export function isSeverityAtLeast(
  value: SecuritySeverity,
  min: SecuritySeverity
): boolean {
  return severityScore(value) >= severityScore(min);
}

export function severityScore(value: SecuritySeverity): number {
  if (value === 'high') {
    return 3;
  }
  if (value === 'medium') {
    return 2;
  }
  return 1;
}

function inferByAction(action: string): { severity: SecuritySeverity; category: SecurityCategory } {
  if (action.startsWith('auth.')) {
    if (action.includes('failed') || action.includes('revoked')) {
      return { severity: 'high', category: 'auth' };
    }
    return { severity: 'medium', category: 'auth' };
  }
  if (action.startsWith('api_key.')) {
    return { severity: 'high', category: 'config' };
  }
  if (action === 'audit.export') {
    return { severity: 'high', category: 'data' };
  }
  if (action === 'raw.search' || action === 'raw.view') {
    return { severity: 'medium', category: 'data' };
  }
  if (action.startsWith('access.') || action.startsWith('github.permissions.')) {
    return { severity: 'medium', category: 'access' };
  }
  if (action.startsWith('oidc.')) {
    return { severity: 'medium', category: 'auth' };
  }
  if (action.startsWith('security.')) {
    return { severity: 'high', category: 'access' };
  }
  return { severity: 'low', category: 'config' };
}

function isSecurityRelevantAction(action: string): boolean {
  if (SECURITY_ACTION_EXACT.has(action)) {
    return true;
  }
  return SECURITY_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

function parseSeverity(input: unknown): SecuritySeverity | null {
  if (input === 'low' || input === 'medium' || input === 'high') {
    return input;
  }
  return null;
}

function parseCategory(input: unknown): SecurityCategory | null {
  if (input === 'auth' || input === 'access' || input === 'data' || input === 'config') {
    return input;
  }
  return null;
}
