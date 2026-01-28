const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const useDevProxy = (() => {
  if (!import.meta.env.DEV) return false;
  if (typeof rawBaseUrl !== "string") return false;
  const v = rawBaseUrl.trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://");
})();

const baseUrl = useDevProxy ? "" : rawBaseUrl;

const jsonHeaders = { "content-type": "application/json" };

const defaultTimeoutMs = import.meta.env.PROD ? 20_000 : 8_000;

const makeUuidV4 = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const getOrCreateDeviceId = () => {
  try {
    const existing = localStorage.getItem("device_id");
    if (existing?.trim()) return existing.trim();
    const created = makeUuidV4();
    localStorage.setItem("device_id", created);
    return created;
  } catch {
    return null;
  }
};

const withAuthHeaders = (initHeaders?: HeadersInit) => {
  const headers = new Headers(initHeaders ?? {});
  try {
    const token = localStorage.getItem("auth_token");
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  } catch {}
  const deviceId = getOrCreateDeviceId();
  if (deviceId && !headers.has("x-device-id")) headers.set("x-device-id", deviceId);
  return headers;
};

const request = async <T>(
  path: string,
  init: RequestInit,
  timeoutMs = defaultTimeoutMs,
): Promise<T> => {
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
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
    const text = await res.text();
    if (!res.ok) {
      const trimmed = text?.trim() ?? "";
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed) as { code?: unknown; message?: unknown } | null;
          if (parsed && typeof parsed === "object") {
            const code = typeof parsed.code === "string" ? parsed.code : null;
            const message =
              typeof parsed.message === "string"
                ? parsed.message
                : parsed.message
                  ? JSON.stringify(parsed.message)
                  : null;
            throw new Error(code || message || trimmed);
          }
        } catch {}
        throw new Error(trimmed);
      }
      throw new Error(`HTTP_${res.status}`);
    }
    if (!text) return {} as T;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") {
        const rec = parsed as Record<string, unknown>;
        const code = rec.code;
        if (code === "00" || code === "09") {
          return (rec.data ?? {}) as T;
        }
        if (code === "99") {
          const msg = rec.message ? JSON.stringify(rec.message) : "REQUEST_FAILED";
          throw new Error(msg);
        }
      }
      return parsed as T;
    } catch {
      throw new Error(text.trim() || "INVALID_RESPONSE");
    }
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
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  },
};
