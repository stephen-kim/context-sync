import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { ValidationError } from '../../errors.js';

const GITHUB_API_BASE = 'https://api.github.com';

export type GithubAppInstallationResponse = {
  id: number;
  account?: {
    login?: string;
    type?: string;
  };
  repository_selection?: string;
  permissions?: Record<string, string>;
};

export type GithubRepoSummary = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch?: string | null;
};

export type GithubUserSummary = {
  id: number;
  login: string;
};

export type GithubRepoCollaborator = {
  id: number;
  login: string;
  role_name?: string;
  permission?: string;
  permissions?: Record<string, boolean>;
};

export type GithubTeamMember = {
  id: number;
  login: string;
};

export type GithubRepoTeam = {
  id: number;
  slug: string;
  permission: string;
  organization_login: string;
};

type GithubRepositoriesResponse = {
  repositories?: GithubRepoSummary[];
};

export async function issueGithubAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const key = createPrivateKey(privateKeyPem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 540)
    .sign(key);
}

export async function getInstallationDetails(
  appJwt: string,
  installationId: bigint
): Promise<GithubAppInstallationResponse> {
  return githubApiJson<GithubAppInstallationResponse>(`${GITHUB_API_BASE}/app/installations/${installationId}`, {
    method: 'GET',
    headers: githubAppHeaders(appJwt),
  });
}

export async function issueInstallationAccessToken(
  appJwt: string,
  installationId: bigint
): Promise<string> {
  const payload = await githubApiJson<{ token?: string }>(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: githubAppHeaders(appJwt),
    }
  );
  const token = (payload.token || '').trim();
  if (!token) {
    throw new ValidationError('Failed to obtain GitHub installation token.');
  }
  return token;
}

export async function listInstallationRepositories(
  installationToken: string
): Promise<GithubRepoSummary[]> {
  const repos: GithubRepoSummary[] = [];

  let page = 1;
  while (true) {
    const response = await githubApiJson<GithubRepositoriesResponse>(
      `${GITHUB_API_BASE}/installation/repositories?per_page=100&page=${page}`,
      {
        method: 'GET',
        headers: {
          ...githubBaseHeaders(),
          Authorization: `Bearer ${installationToken}`,
        },
      }
    );

    const batch = Array.isArray(response.repositories) ? response.repositories : [];
    repos.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }

  return repos;
}

export async function getGithubUserByLogin(
  installationToken: string,
  login: string
): Promise<GithubUserSummary | null> {
  const normalizedLogin = String(login || '').trim();
  if (!normalizedLogin) {
    return null;
  }
  const response = await fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(normalizedLogin)}`, {
    method: 'GET',
    headers: {
      ...githubBaseHeaders(),
      Authorization: `Bearer ${installationToken}`,
    },
  });
  if (response.status === 404) {
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `${response.status} ${response.statusText}`;
    throw new ValidationError(`GitHub API error: ${message}`);
  }
  const id = Number((payload as { id?: unknown }).id);
  const userLogin = String((payload as { login?: unknown }).login || '').trim();
  if (!Number.isFinite(id) || !userLogin) {
    return null;
  }
  return {
    id,
    login: userLogin,
  };
}

export async function listRepositoryCollaboratorsWithPermissions(
  installationToken: string,
  owner: string,
  repo: string
): Promise<GithubRepoCollaborator[]> {
  const normalizedOwner = String(owner || '').trim();
  const normalizedRepo = String(repo || '').trim();
  if (!normalizedOwner || !normalizedRepo) {
    return [];
  }

  const rows: GithubRepoCollaborator[] = [];
  let page = 1;
  while (true) {
    const response = await githubApiJson<Array<Record<string, unknown>>>(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(
        normalizedRepo
      )}/collaborators?per_page=100&page=${page}`,
      {
        method: 'GET',
        headers: {
          ...githubBaseHeaders(),
          Authorization: `Bearer ${installationToken}`,
        },
      }
    );

    const batch = Array.isArray(response) ? response : [];
    rows.push(
      ...batch
        .map((item) => ({
          id: Number(item.id),
          login: String(item.login || '').trim(),
          role_name: typeof item.role_name === 'string' ? item.role_name : undefined,
          permission: typeof item.permission === 'string' ? item.permission : undefined,
          permissions:
            item.permissions && typeof item.permissions === 'object' && !Array.isArray(item.permissions)
              ? (item.permissions as Record<string, boolean>)
              : undefined,
        }))
        .filter((item) => Number.isFinite(item.id) && item.login.length > 0)
    );

    if (batch.length < 100) {
      break;
    }
    page += 1;
  }

  return rows;
}

export async function listTeamMembers(
  installationToken: string,
  orgLogin: string,
  teamSlug: string
): Promise<GithubTeamMember[]> {
  const normalizedOrg = String(orgLogin || '').trim();
  const normalizedSlug = String(teamSlug || '').trim();
  if (!normalizedOrg || !normalizedSlug) {
    return [];
  }

  const rows: GithubTeamMember[] = [];
  let page = 1;
  while (true) {
    const response = await githubApiJson<Array<Record<string, unknown>>>(
      `${GITHUB_API_BASE}/orgs/${encodeURIComponent(normalizedOrg)}/teams/${encodeURIComponent(
        normalizedSlug
      )}/members?per_page=100&page=${page}`,
      {
        method: 'GET',
        headers: {
          ...githubBaseHeaders(),
          Authorization: `Bearer ${installationToken}`,
        },
      }
    );
    const batch = Array.isArray(response) ? response : [];
    rows.push(
      ...batch
        .map((item) => ({
          id: Number(item.id),
          login: String(item.login || '').trim(),
        }))
        .filter((item) => Number.isFinite(item.id) && item.login.length > 0)
    );
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }
  return rows;
}

export async function listRepositoryTeams(
  installationToken: string,
  owner: string,
  repo: string
): Promise<GithubRepoTeam[]> {
  const normalizedOwner = String(owner || '').trim();
  const normalizedRepo = String(repo || '').trim();
  if (!normalizedOwner || !normalizedRepo) {
    return [];
  }

  const teams: GithubRepoTeam[] = [];
  let page = 1;
  while (true) {
    const response = await githubApiJson<Array<Record<string, unknown>>>(
      `${GITHUB_API_BASE}/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(
        normalizedRepo
      )}/teams?per_page=100&page=${page}`,
      {
        method: 'GET',
        headers: {
          ...githubBaseHeaders(),
          Authorization: `Bearer ${installationToken}`,
        },
      }
    );

    const batch = Array.isArray(response) ? response : [];
    teams.push(
      ...batch
        .map((item) => {
          const organization =
            item.organization && typeof item.organization === 'object'
              ? (item.organization as Record<string, unknown>)
              : {};
          return {
            id: Number(item.id),
            slug: String(item.slug || '').trim(),
            permission: String(item.permission || '').trim().toLowerCase(),
            organization_login: String(organization.login || '').trim(),
          };
        })
        .filter(
          (item) =>
            Number.isFinite(item.id) &&
            item.slug.length > 0 &&
            item.organization_login.length > 0 &&
            item.permission.length > 0
        )
    );

    if (batch.length < 100) {
      break;
    }
    page += 1;
  }

  return teams;
}

function githubBaseHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'claustrum-memory-core',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function githubAppHeaders(appJwt: string): Record<string, string> {
  return {
    ...githubBaseHeaders(),
    Authorization: `Bearer ${appJwt}`,
  };
}

async function githubApiJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `${response.status} ${response.statusText}`;
    throw new ValidationError(`GitHub API error: ${message}`);
  }
  return payload as T;
}
