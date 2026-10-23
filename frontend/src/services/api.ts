const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_PUBLIC_API_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_PUBLIC_API_TOKEN}` }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;

    try {
      const parsed = JSON.parse(body) as { detail?: string | Array<{ msg?: string }> };

      message = Array.isArray(parsed.detail)
        ? parsed.detail
            .map((item) => item.msg)
            .filter(Boolean)
            .join(', ')
        : (parsed.detail ?? body);
    } catch {
    }

    throw new Error(message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
