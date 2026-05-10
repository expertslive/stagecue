export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!resp.ok) {
    let body: unknown;
    try { body = await resp.json(); } catch { body = await resp.text(); }
    throw new ApiError(resp.status, resp.statusText, body);
  }
  if (resp.status === 204) return undefined as T;
  return await resp.json();
}
