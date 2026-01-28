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

export class ApiRequestError extends Error {
  data: unknown;
  constructor(code: string, data: unknown) {
    super(code);
    this.name = "ApiRequestError";
    this.data = data;
  }
}

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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

const apiErrorCodeFrom = (parsed: unknown): string | null => {
  if (!isRecord(parsed)) return null;
  const code = typeof parsed.code === "string" ? parsed.code : null;
  if (code === "99") {
    const msg = parsed.message;
    if (isRecord(msg) && typeof msg.what === "string") return msg.what;
  }
  if (code) return code;
  const msg = parsed.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return null;
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
          const parsed = JSON.parse(trimmed) as unknown;
          const extracted = apiErrorCodeFrom(parsed);
          if (extracted && isRecord(parsed)) throw new ApiRequestError(extracted, parsed.data);
          throw new Error(extracted ?? trimmed);
        } catch {
          throw new Error(trimmed);
        }
      }
      throw new Error(`HTTP_${res.status}`);
    }
    if (!text) return {} as T;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed)) {
        const code = parsed.code;
        if (code === "00" || code === "09") {
          return (parsed.data ?? {}) as T;
        }
        if (code === "99") {
          const extracted = apiErrorCodeFrom(parsed) ?? "REQUEST_FAILED";
          throw new ApiRequestError(extracted, parsed.data);
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
