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
    // Read the body once as text, then try to upgrade it to JSON. Calling .json()
    // followed by .text() on the same Response throws "body disturbed or locked"
    // in Firefox because the stream is single-use.
    const raw = await resp.text();
    let body: unknown = raw;
    if (raw.length > 0) {
      try { body = JSON.parse(raw); } catch { /* keep raw text */ }
    }
    throw new ApiError(resp.status, resp.statusText, body);
  }
  if (resp.status === 204) return undefined as T;
  return await resp.json();
}
