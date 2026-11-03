export function marketplaceApi(apiBaseUrl: string, token?: string) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? `Request failed (${response.status}).`);
    }
    return body;
  };
}
