const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const jsonHeaders = { "content-type": "application/json" };

const request = async <T>(path: string, init: RequestInit, timeoutMs = 8000): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal
    });
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body ?? {}) }),
  postNoJson: async (path: string, body: unknown) => {
    await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: jsonHeaders,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include"
    });
  }
};
