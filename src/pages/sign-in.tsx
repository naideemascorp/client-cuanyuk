import { A, useNavigate } from "@solidjs/router";
import { createEffect, createResource, createSignal } from "solid-js";
import { api } from "../utils/api";
import { useAuth } from "../state/auth";
import { Toast, type ToastState } from "../components/toast";
import { Modal } from "../components/modal";

export default function SignIn() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [rememberMe, setRememberMe] = createSignal(true);
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: number | null = null;
  const [resetOpen, setResetOpen] = createSignal(false);
  const [resetEmail, setResetEmail] = createSignal("");
  const [resetSent, setResetSent] = createSignal(false);
  const [resetBusy, setResetBusy] = createSignal(false);
  const [resetNextAllowedAt, setResetNextAllowedAt] = createSignal<number | null>(null);
  const [resetRemainingToday, setResetRemainingToday] = createSignal<number | null>(null);
  const [resetRetryAt, setResetRetryAt] = createSignal<number | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());
  const [resetSuccessCount, setResetSuccessCount] = createSignal(0);
  const [detectedIp, setDetectedIp] = createSignal<string | null>(null);
  const [signupAllowed] = createResource(async () => {
    const res = await api.get<{ allowed: boolean; ip?: string }>("/auth/signup-allowed");
    setDetectedIp(res.ip ?? null);
    return res.allowed;
  });

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
    try {
      if (rememberMe()) {
        try {
          localStorage.setItem("remembered_login", identifier().trim());
        } catch {}
      } else {
        try {
          localStorage.removeItem("remembered_login");
        } catch {}
      }
      await auth.signIn(identifier(), password());
    } catch (err) {
      const code = err instanceof Error ? err.message : "SIGNIN_FAILED";
      const msg =
        code === "INVALID_INPUT" || code === "INVALID_CREDENTIALS"
          ? "Wrong login or password."
          : code === "USER_NOT_FOUND"
            ? "User is not found in our system."
          : code === "EMAIL_NOT_VERIFIED"
            ? "Email not verified yet. Check your inbox."
            : "Sign in failed. Try again.";
      setToast({ id: Date.now(), kind: "error", message: msg });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    }
  };

  createEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  });

  createEffect(() => {
    try {
      const raw = sessionStorage.getItem("flash_toast");
      if (!raw) return;
      sessionStorage.removeItem("flash_toast");
      const parsed = JSON.parse(raw) as { kind?: "success" | "error" | "progress"; message?: string } | null;
      if (!parsed?.message || !parsed.kind) return;
      setToast({ id: Date.now(), kind: parsed.kind, message: parsed.message });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    } catch {}
  });

  createEffect(() => {
    try {
      const remembered = localStorage.getItem("remembered_login");
      if (!remembered) return;
      setIdentifier(remembered);
      setRememberMe(true);
    } catch {}
  });

  const formatCountdown = (ms: number) => {
    const clamped = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const requestReset = async () => {
    const e = resetEmail().trim();
    if (!e) {
      setToast({ id: Date.now(), kind: "error", message: "Please enter your email address." });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
      return;
    }
    const basicEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (!basicEmailOk) {
      setToast({ id: Date.now(), kind: "error", message: "Email is invalid." });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
      return;
    }
    setResetBusy(true);
    try {
      const res = await api.post<{ ok: boolean; code?: string; nextAllowedAt?: string; remainingToday?: number; retryAt?: string }>(
        "/auth/password-reset/request",
        { email: e }
      );
      if (!res.ok) {
        if (res.code === "USER_NOT_FOUND") {
          setToast({ id: Date.now(), kind: "error", message: "User not found in the system." });
          toastTimer = window.setTimeout(() => setToast(null), 5000);
          return;
        }
        if (res.code === "RESEND_COOLDOWN" && res.nextAllowedAt) {
          setResetNextAllowedAt(new Date(res.nextAllowedAt).getTime());
          return;
        }
        if (res.code === "RESEND_LIMIT" && res.retryAt) {
          setResetRetryAt(new Date(res.retryAt).getTime());
          setResetRemainingToday(0);
          return;
        }
        setToast({ id: Date.now(), kind: "error", message: res.code ?? "RESET_REQUEST_FAILED" });
        toastTimer = window.setTimeout(() => setToast(null), 5000);
        return;
      }
      setResetSent(true);
      setResetSuccessCount((n) => {
        const next = n + 1;
        if (next >= 3) setResetRemainingToday(0);
        return next;
      });
      setResetRetryAt(null);
      setResetNextAllowedAt(res.nextAllowedAt ? new Date(res.nextAllowedAt).getTime() : Date.now() + 60_000);
      setResetRemainingToday(typeof res.remainingToday === "number" ? res.remainingToday : null);
      setToast({ id: Date.now(), kind: "success", message: "Password reset link sent. Check your inbox." });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    } catch (err) {
      setToast({ id: Date.now(), kind: "error", message: err instanceof Error ? err.message : "RESET_REQUEST_FAILED" });
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    } finally {
      setResetBusy(false);
    }
  };

  const canResend = () => {
    if (resetSuccessCount() >= 3) return false;
    if (!resetSent()) return true;
    if (resetBusy()) return false;
    const retryAt = resetRetryAt();
    if (retryAt && nowMs() < retryAt) return false;
    const next = resetNextAllowedAt();
    if (next && nowMs() < next) return false;
    const remaining = resetRemainingToday();
    if (typeof remaining === "number" && remaining <= 0) return false;
    return true;
  };

  const openReset = () => {
    setResetOpen(true);
    const ident = identifier().trim();
    setResetEmail(ident.includes("@") ? ident : "");
    setResetSent(false);
    setResetNextAllowedAt(null);
    setResetRetryAt(null);
    setResetRemainingToday(null);
    setResetSuccessCount(0);
  };

  return (
    <div class="shell">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <h1>Sign In</h1>
          </div>

          <div class="grid">
            <div class="card" style="grid-column: span 7">
              <div class="cardInner">
                <form onSubmit={onSubmit} class="grid" style="grid-template-columns: repeat(12, 1fr); gap: 14px">
                  <div class="field" style="grid-column: span 12">
                    <label>Email or Username</label>
                    <input value={identifier()} onInput={(e) => setIdentifier(e.currentTarget.value)} autocomplete="username" />
                  </div>
                  <div class="field" style="grid-column: span 12">
                    <label>Password</label>
                    <input
                      type="password"
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                      autocomplete="current-password"
                    />
                  </div>
                  <div style="grid-column: span 12; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center">
                    <label style="display: inline-flex; gap: 10px; align-items: center; text-transform: none; letter-spacing: 0; font-size: 13px; color: rgba(250,250,255,0.72)">
                      <input type="checkbox" checked={rememberMe()} onChange={(e) => setRememberMe(e.currentTarget.checked)} />
                      Remember Me
                    </label>
                    {signupAllowed() ? (
                      <button class="btn" type="button" onClick={openReset} disabled={auth.loading()}>
                        Forgot Password
                      </button>
                    ) : null}
                  </div>
                  {signupAllowed() ? (
                    <div />
                  ) : null}
                  <div
                    style={{
                      "grid-column": "span 12",
                      display: "grid",
                      gap: "10px",
                      "grid-template-columns": signupAllowed() ? "1fr 1fr" : "1fr"
                    }}
                  >
                    <button class="btn btnHero" type="submit" disabled={auth.loading()} style="width: 100%">
                      <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                        {auth.loading() ? <span class="spinner" /> : null}
                        <span>{auth.loading() ? "Working…" : "Sign In"}</span>
                      </span>
                    </button>
                    {signupAllowed() ? (
                      <button class="btn btnHero" type="button" onClick={() => navigate("/sign-up")} style="width: 100%">
                        <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                          <span>Sign Up</span>
                        </span>
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>

            <div class="card" style="grid-column: span 5">
              <div class="cardInner needAccessBox">
                <div class="needAccessInner">
                  <div class="needAccessTitle">Need Access?</div>
                  <div class="needAccessText">
                    We’re invite‑only right now. If you wanna get in, email{" "}
                    <a class="pillLink" href="mailto:support@cuanyuk.com">
                      support@cuanyuk.com
                    </a>{" "}
                    and just drop:
                  </div>
                  <div class="needAccessList">
                    <div>1) your full name / company / org name</div>
                    <div>2) your phone / WhatsApp number</div>
                    <div>3) why you want access (what you’re trying to do)</div>
                  </div>
                  <div class="needAccessHint">
                    Keep it short. If it’s urgent, say so—we’ll handle it.
                    {!signupAllowed.loading && !signupAllowed() && detectedIp() ? ` (Detected IP: ${detectedIp()})` : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={resetOpen()}
        onClose={() => {
          setResetOpen(false);
          setResetBusy(false);
        }}
      >
        <div style="display: grid; gap: 12px">
          <div style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px">Forgot Password</div>
          <div style="color: rgba(250,250,255,0.72); font-size: 14px; line-height: 1.55">
            Enter your email to receive a reset link (expires in 1 day).
          </div>
          <div class="field">
            <label>Email</label>
            <input value={resetEmail()} onInput={(e) => setResetEmail(e.currentTarget.value)} autocomplete="email" />
          </div>
          <div
            style={{
              display: "grid",
              gap: "10px",
              "grid-template-columns": resetSent() && resetSuccessCount() < 3 ? "1fr" : "1fr 1fr"
            }}
          >
            {resetSuccessCount() >= 3 ? null : (
              <button class="btn btnHero" type="button" disabled={!canResend()} onClick={() => void requestReset()} style="width: 100%">
                <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                  {resetBusy() ? <span class="spinner" /> : null}
                  <span>{resetSent() ? "Resend" : "Submit"}</span>
                </span>
              </button>
            )}
            {resetSent() && resetSuccessCount() < 3 ? null : (
              <button class="btn btnHero" type="button" onClick={() => setResetOpen(false)} style="width: 100%">
                <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                  <span>Close</span>
                </span>
              </button>
            )}
          </div>
          {resetSuccessCount() >= 3 || resetRemainingToday() === 0 ? (
            <div style="color: rgba(250,250,255,0.86); font-size: 13px; line-height: 1.55">
              You’ve reached the maximum of 3 resend requests today. Please try again tomorrow.
            </div>
          ) : null}
          <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.55">
            {(() => {
              const retryAt = resetRetryAt();
              if (retryAt && nowMs() < retryAt) return `Daily limit reached. Try again in ${formatCountdown(retryAt - nowMs())}.`;
              const next = resetNextAllowedAt();
              if (next && nowMs() < next) return `Resend available in ${formatCountdown(next - nowMs())}.`;
              const remaining = resetRemainingToday();
              if (typeof remaining === "number") return `Remaining resend attempts today: ${remaining}.`;
              return "";
            })()}
          </div>
        </div>
      </Modal>
      <Toast
        toast={toast()}
        onClose={() => {
          if (toastTimer) window.clearTimeout(toastTimer);
          toastTimer = null;
          setToast(null);
        }}
      />
    </div>
  );
}
