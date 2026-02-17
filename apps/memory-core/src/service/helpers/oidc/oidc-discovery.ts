import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthenticationError } from '../../errors.js';
import {
  extractGroupsFromPayload,
  normalizeIssuer,
  type OidcDiscoveryDocument,
  type OidcIdentityClaims,
} from './oidc-types.js';

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const discoveryCache = new Map<string, { expiresAt: number; document: OidcDiscoveryDocument }>();

export async function fetchDiscovery(issuerUrl: string): Promise<OidcDiscoveryDocument> {
  const issuer = normalizeIssuer(issuerUrl);
  const now = Date.now();
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > now) {
    return cached.document;
  }

  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new AuthenticationError(`OIDC discovery failed (${response.status} ${response.statusText})`);
  }

  const json = (await response.json()) as Partial<OidcDiscoveryDocument>;
  if (!json.authorization_endpoint || !json.token_endpoint || !json.jwks_uri || !json.issuer) {
    throw new AuthenticationError('OIDC discovery document is missing required fields');
  }

  const document: OidcDiscoveryDocument = {
    issuer: json.issuer,
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    userinfo_endpoint: json.userinfo_endpoint,
    jwks_uri: json.jwks_uri,
  };
  discoveryCache.set(issuer, {
    expiresAt: now + DISCOVERY_TTL_MS,
    document,
  });
  return document;
}

export async function resolveIdentityClaims(args: {
  provider: {
    issuerUrl: string;
    clientId: string;
    claimGroupsName: string;
    claimGroupsFormat: 'id' | 'name';
  };
  discovery: OidcDiscoveryDocument;
  idToken?: string;
  accessToken?: string;
  expectedNonce: string;
}): Promise<OidcIdentityClaims> {
  let idTokenClaims: Record<string, unknown> | null = null;
  if (args.idToken) {
    const jwks = createRemoteJWKSet(new URL(args.discovery.jwks_uri));
    const { payload } = await jwtVerify(args.idToken, jwks, {
      issuer: args.discovery.issuer,
      audience: args.provider.clientId,
    });
    if (payload.nonce !== args.expectedNonce) {
      throw new AuthenticationError('OIDC nonce mismatch');
    }
    idTokenClaims = payload as Record<string, unknown>;
  }

  let userInfoClaims: Record<string, unknown> | null = null;
  if (args.accessToken && args.discovery.userinfo_endpoint) {
    const userInfoResponse = await fetch(args.discovery.userinfo_endpoint, {
      headers: {
        authorization: `Bearer ${args.accessToken}`,
      },
    });
    if (userInfoResponse.ok) {
      userInfoClaims = (await userInfoResponse.json()) as Record<string, unknown>;
    }
  }

  const merged = {
    ...(userInfoClaims || {}),
    ...(idTokenClaims || {}),
  } as Record<string, unknown>;

  const subject = typeof merged.sub === 'string' ? merged.sub.trim() : '';
  if (!subject) {
    throw new AuthenticationError('OIDC subject (sub) is missing');
  }

  const email = typeof merged.email === 'string' ? merged.email.trim().toLowerCase() : undefined;
  const name = typeof merged.name === 'string' ? merged.name.trim() : undefined;
  const groups = extractGroupsFromPayload(
    merged,
    args.provider.claimGroupsName,
    args.provider.claimGroupsFormat
  );

  return {
    issuer: normalizeIssuer(args.discovery.issuer || args.provider.issuerUrl),
    subject,
    email,
    name,
    groups,
  };
}
