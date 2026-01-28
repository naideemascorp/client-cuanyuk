import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

const host = process.env.TAURI_DEV_HOST || false;

const computeWsTarget = (apiBase: string, explicitWs?: string) => {
  const ws = explicitWs?.trim();
  if (ws) return ws;
  try {
    const u = new URL(apiBase);
    const wsProtocol = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${u.host}`;
  } catch {
    return "ws://localhost:3001";
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBase = env.VITE_API_BASE_URL?.trim() || "http://localhost:3001";
  const wsTarget = computeWsTarget(apiBase, env.VITE_WS_BASE_URL);
  let wsProxy: Record<string, unknown> | null = null;
  try {
    const u = new URL(wsTarget);
    const host = u.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) wsProxy = { target: wsTarget, ws: true, changeOrigin: true, secure: false };
  } catch {}

  return {
    build: { outDir: "build" },
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    plugins: [solid()],
    preview: {
      port: 3000,
      strictPort: true,
    },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      proxy: {
        "/auth": { target: apiBase, changeOrigin: true, secure: true },
        "/cash": { target: apiBase, changeOrigin: true, secure: true },
        "/categories": { target: apiBase, changeOrigin: true, secure: true },
        "/merchants": { target: apiBase, changeOrigin: true, secure: true },
        "/notifications": { target: apiBase, changeOrigin: true, secure: true },
        "/payments": { target: apiBase, changeOrigin: true, secure: true },
        "/public": { target: apiBase, changeOrigin: true, secure: true },
        "/docs": { target: apiBase, changeOrigin: true, secure: true },
        "/assets": { target: apiBase, changeOrigin: true, secure: true },
        "/health": { target: apiBase, changeOrigin: true, secure: true },
        "/api": { target: apiBase, changeOrigin: true, secure: true },
        ...(wsProxy ? { "/ws": wsProxy } : {}),
      },
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 3001,
          }
        : undefined,
      host: host,
      port: 3000,
      strictPort: true,
    },
  };
});
