import path from 'path';

type ChangeAnalysis = {
  type: string;
  scope: string;
  hasTests: boolean;
  hasDocs: boolean;
  isBreaking: boolean;
};

function analyzeChanges(files: string[], isTracked: (filepath: string) => boolean): ChangeAnalysis {
  const analysis: ChangeAnalysis = {
    type: 'chore',
    scope: '',
    hasTests: false,
    hasDocs: false,
    isBreaking: false
  };

  const hasNewFiles = files.some(f => !isTracked(f));
  const hasComponents = files.some(f => f.includes('component') || f.match(/\.(tsx|jsx)$/));
  const hasApi = files.some(f => f.includes('api') || f.includes('route'));
  const hasModels = files.some(f => f.includes('model') || f.includes('schema'));
  const hasTests = files.some(f => f.includes('.test.') || f.includes('.spec.'));
  const hasDocs = files.some(f => f.match(/\.(md|txt)$/i));
  const hasConfig = files.some(f => f.match(/\.(json|yaml|yml|toml|config)$/));

  analysis.hasTests = hasTests;
  analysis.hasDocs = hasDocs;

  if (hasNewFiles && hasComponents) {
    analysis.type = 'feat';
    analysis.scope = 'components';
  } else if (hasNewFiles && hasApi) {
    analysis.type = 'feat';
    analysis.scope = 'api';
  } else if (hasComponents) {
    analysis.type = 'fix';
    analysis.scope = 'components';
  } else if (hasApi) {
    analysis.type = 'fix';
    analysis.scope = 'api';
  } else if (hasModels) {
    analysis.type = 'feat';
    analysis.scope = 'models';
  } else if (hasTests) {
    analysis.type = 'test';
  } else if (hasDocs) {
    analysis.type = 'docs';
  } else if (hasConfig) {
    analysis.type = 'chore';
    analysis.scope = 'config';
  }

  return analysis;
}

function generateDescription(files: string[]): string {
  if (files.length === 1) {
    const file = path.basename(files[0], path.extname(files[0]));
    return `update ${file}`;
  }

  const hasComponents = files.some(f => f.includes('component'));
  const hasApi = files.some(f => f.includes('api'));
  const hasModels = files.some(f => f.includes('model'));
  const hasAuth = files.some(f => f.includes('auth'));

  if (hasAuth) return 'update authentication';
  if (hasComponents) return 'update components';
  if (hasApi) return 'update API routes';
  if (hasModels) return 'update data models';

  return `update ${files.length} files`;
}

function generateConventionalCommit(
  analysis: ChangeAnalysis,
  files: string[],
  isTracked: (filepath: string) => boolean
): string {
  const scope = analysis.scope ? `(${analysis.scope})` : '';
  const description = generateDescription(files);
  let message = `${analysis.type}${scope}: ${description}\n\n`;

  const details: string[] = [];
  for (const file of files.slice(0, 5)) {
    const action = isTracked(file) ? 'Update' : 'Add';
    details.push(`- ${action} ${file}`);
  }
  if (files.length > 5) {
    details.push(`- And ${files.length - 5} more files`);
  }
  message += details.join('\n');
  if (analysis.hasTests) {
    message += '\n\nTests: Added/updated';
  }
  return message;
}

function generateSimpleCommit(analysis: ChangeAnalysis, files: string[]): string {
  const description = generateDescription(files);
  return `${analysis.type}: ${description}`;
}

function generateDescriptiveCommit(analysis: ChangeAnalysis, files: string[]): string {
  const description = generateDescription(files);
  const scope = analysis.scope ? ` in ${analysis.scope}` : '';
  return `${description}${scope}\n\nFiles changed:\n${files.slice(0, 10).map(f => `- ${f}`).join('\n')}`;
}

export function suggestCommitMessageFromFiles(
  files: string[],
  convention: string,
  isTracked: (filepath: string) => boolean
): string {
  const analysis = analyzeChanges(files, isTracked);
  if (convention === 'conventional') {
    return generateConventionalCommit(analysis, files, isTracked);
  }
  if (convention === 'simple') {
    return generateSimpleCommit(analysis, files);
  }
  return generateDescriptiveCommit(analysis, files);
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}
