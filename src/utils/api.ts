const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const jsonHeaders = { "content-type": "application/json" };

const defaultTimeoutMs = import.meta.env.PROD ? 20_000 : 8_000;

const withAuthHeaders = (initHeaders?: HeadersInit) => {
  const headers = new Headers(initHeaders ?? {});
  try {
    const token = localStorage.getItem("auth_token");
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  } catch {}
  return headers;
};

const request = async <T>(path: string, init: RequestInit, timeoutMs = defaultTimeoutMs): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const headers = withAuthHeaders(init.headers);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        try {
          controller.abort();
        } catch {}
        reject(new Error("TIMEOUT"));
      }, timeoutMs);
    });

    const res = await Promise.race([
      fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        credentials: "include",
        signal: controller.signal
      }),
      timeoutPromise
    ]);
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
};

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body ?? {}) }),
  postNoJson: async (path: string, body: unknown) => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          try {
            controller.abort();
          } catch {}
          reject(new Error("TIMEOUT"));
        }, defaultTimeoutMs);
      });
      await Promise.race([
        fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: withAuthHeaders(jsonHeaders),
          body: body ? JSON.stringify(body) : undefined,
          credentials: "include",
          signal: controller.signal
        }),
        timeoutPromise
      ]);
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  }
};
