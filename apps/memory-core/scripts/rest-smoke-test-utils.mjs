export async function waitForHealthcheck(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error(`memory-core healthcheck timed out: ${baseUrl}/healthz`);
}

export function createApiClient(baseUrl, apiKey) {
  async function callApi(pathname, init = {}) {
    const result = await callApiRaw(pathname, init);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(result.body.error || `${result.status} ${result.statusText}`);
    }
    return result.body;
  }

  async function callApiRaw(pathname, init = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(init.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      statusText: response.statusText,
      body,
    };
  }

  async function callApiMultipart(pathname, args) {
    const form = new FormData();
    form.set('workspace_key', args.workspace_key);
    form.set('source', args.source);
    if (args.project_key) {
      form.set('project_key', args.project_key);
    }
    form.set('file', new Blob([args.fileContent], { type: 'application/jsonl' }), args.fileName);

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      body: form,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `${response.status} ${response.statusText}`);
    }
    return body;
  }

  return {
    callApi,
    callApiRaw,
    callApiMultipart,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
