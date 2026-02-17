'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '../../components/ui';

const API_BASE_URL = (process.env.NEXT_PUBLIC_MEMORY_CORE_URL || '').trim();

type InviteInfo = {
  workspace_key: string;
  workspace_name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  project_roles: Record<string, 'OWNER' | 'MAINTAINER' | 'WRITER' | 'READER'>;
  expires_at: string;
  used_at: string | null;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = useMemo(() => String(params?.token || ''), [params]);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !API_BASE_URL) {
      setLoading(false);
      return;
    }
    void loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadInvite() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/invite/${encodeURIComponent(token)}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as InviteInfo;
      setInvite(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvite(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/invite/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password,
          name: name.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `${response.status} ${response.statusText}`);
      }
      setSuccess('Invite accepted. You can now sign in from the admin login page.');
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : String(acceptError));
    } finally {
      setBusy(false);
    }
  }

  if (!API_BASE_URL) {
    return (
      <main className="dashboard">
        <section className="content">
          <Card>
            <CardHeader>
              <CardTitle>Invite Setup Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="error">NEXT_PUBLIC_MEMORY_CORE_URL is not configured.</p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="dashboard">
        <section className="content">
          <Card>
            <CardHeader>
              <CardTitle>Loading invite...</CardTitle>
            </CardHeader>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <section className="content">
        <Card>
          <CardHeader>
            <CardTitle>Accept Workspace Invite</CardTitle>
          </CardHeader>
          <CardContent>
            {invite ? (
              <div className="stack gap-3">
                <p className="muted">
                  You are invited to <strong>{invite.workspace_name}</strong> ({invite.workspace_key}) as{' '}
                  <strong>{invite.role}</strong>.
                </p>
                <p className="muted text-xs">Email: {invite.email}</p>
                <p className="muted text-xs">
                  Expires at: {new Date(invite.expires_at).toLocaleString()}
                </p>
                <form className="stack" onSubmit={acceptInvite}>
                  <div className="stack gap-1">
                    <Label>Name (optional)</Label>
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </div>
                  <div className="stack gap-1">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={12}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Accepting...' : 'Accept Invite'}
                  </Button>
                </form>
              </div>
            ) : (
              <p className="error">Invite is invalid or unavailable.</p>
            )}
            {error ? <p className="error">{error}</p> : null}
            {success ? <p className="muted">{success}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
