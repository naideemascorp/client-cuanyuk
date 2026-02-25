import { Modal } from "@/components/modal";
import { Toast, type ToastState } from "@/components/toast";
import { useAuth } from "@/state/auth";
import { ApiRequestError, api } from "@/utils/api";
import { useNavigate } from "@solidjs/router";
import { Show, createEffect, createMemo, createResource, createSignal } from "solid-js";

export default function SignIn() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [rememberMe, setRememberMe] = createSignal(true);
  const [toast, setToast] = createSignal<ToastState>(null);
  let toastTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  const [resetOpen, setResetOpen] = createSignal(false);
  const [resetEmail, setResetEmail] = createSignal("");
  const [resetSent, setResetSent] = createSignal(false);
  const [resetBusy, setResetBusy] = createSignal(false);
  const [resetNextAllowedAt, setResetNextAllowedAt] = createSignal<number | null>(null);
  const [resetRemainingToday, setResetRemainingToday] = createSignal<number | null>(null);
  const [resetRetryAt, setResetRetryAt] = createSignal<number | null>(null);
  const [nowMs, setNowMs] = createSignal(Date.now());
  const [resetSuccessCount, setResetSuccessCount] = createSignal(0);
  const [detectedDeviceId, setDetectedDeviceId] = createSignal<string | null>(null);
  const [detectedIp, setDetectedIp] = createSignal<string | null>(null);
  const [touchedIdentifier, setTouchedIdentifier] = createSignal(false);
  const [touchedPassword, setTouchedPassword] = createSignal(false);
  const identifierError = createMemo(() =>
    touchedIdentifier() && identifier().trim().length === 0 ? "Please fill in this field." : null,
  );
  const passwordError = createMemo(() =>
    touchedPassword() && password().trim().length === 0 ? "Please fill in this field." : null,
  );
  const [signupAllowed] = createResource(async () => {
    const res = await api.get<{ allowed: boolean; deviceId?: string; ip?: string }>(
      "/auth/signup-allowed",
    );
    setDetectedDeviceId(res.deviceId ?? null);
    setDetectedIp(res.ip ?? null);
    return res.allowed;
  });

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setTouchedIdentifier(true);
    setTouchedPassword(true);
    if (identifier().trim().length === 0 || password().trim().length === 0) return;
    if (toastTimer) globalThis.clearTimeout(toastTimer);
    toastTimer = null;
    setToast(null);
    try {
      if (rememberMe()) {
        try {
          localStorage.setItem("remembered_login", identifier().trim());
        } catch { }
      } else {
        try {
          localStorage.removeItem("remembered_login");
        } catch { }
      }
      await auth.signIn(identifier(), password());
    } catch (err) {
      const code = err instanceof Error ? err.message : "SIGNIN_FAILED";
      const msg =
        code === "INVALID_INPUT" || code === "INVALID_CREDENTIALS"
          ? "Wrong username/email or password."
          : code === "USER_NOT_FOUND"
            ? "User is not found in our system."
            : code === "EMAIL_NOT_VERIFIED"
              ? "Your account has been registered but your email is not verified yet. Please check your inbox (and spam folder) for the verification email and click the verification link to activate your account."
              : "Sign in failed. Try again.";
      setToast({ id: Date.now(), kind: "error", message: msg, durationMs: code === "EMAIL_NOT_VERIFIED" ? 12000 : 5000 });
      toastTimer = globalThis.setTimeout(() => setToast(null), code === "EMAIL_NOT_VERIFIED" ? 12000 : 5000);
    }
  };

  createEffect(() => {
    const id = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
  });

  createEffect(() => {
    try {
      const raw = sessionStorage.getItem("flash_toast");
      if (!raw) return;
      sessionStorage.removeItem("flash_toast");
      const parsed = JSON.parse(raw) as {
        kind?: "success" | "error" | "progress";
        message?: string;
      } | null;
      if (!parsed?.message || !parsed.kind) return;
      setToast({ id: Date.now(), kind: parsed.kind, message: parsed.message });
      toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
    } catch { }
  });

  createEffect(() => {
    try {
      const remembered = localStorage.getItem("remembered_login");
      if (!remembered) return;
      setIdentifier(remembered);
      setRememberMe(true);
    } catch { }
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
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      Boolean(v) && typeof v === "object" && !Array.isArray(v);
    const e = resetEmail().trim();
    if (!e) {
      setToast({
        id: Date.now(),
        kind: "error",
        message: "Please enter your email, phone number, or username.",
      });
      toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
      return;
    }
    setResetBusy(true);
    try {
      const res = await api.post<{ nextAllowedAt?: string; remainingToday?: number }>(
        "/auth/password-reset/request",
        { identifier: e },
      );
      setResetSent(true);
      setResetSuccessCount((n) => {
        const next = n + 1;
        if (next >= 3) setResetRemainingToday(0);
        return next;
      });
      setResetRetryAt(null);
      setResetNextAllowedAt(
        res.nextAllowedAt ? new Date(res.nextAllowedAt).getTime() : Date.now() + 60_000,
      );
      setResetRemainingToday(typeof res.remainingToday === "number" ? res.remainingToday : null);
      setToast({
        id: Date.now(),
        kind: "success",
        message: "Password reset link sent. Check your inbox.",
      });
      toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
    } catch (err) {
      const code = err instanceof Error ? err.message : "RESET_REQUEST_FAILED";
      const data = err instanceof ApiRequestError ? err.data : null;
      if (code === "USER_NOT_FOUND") {
        setToast({ id: Date.now(), kind: "error", message: "User not found in the system." });
        toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
        return;
      }
      if (code === "RESEND_COOLDOWN" && isRecord(data) && typeof data.nextAllowedAt === "string") {
        setResetNextAllowedAt(new Date(data.nextAllowedAt).getTime());
        return;
      }
      if (code === "RESEND_LIMIT" && isRecord(data) && typeof data.retryAt === "string") {
        setResetRetryAt(new Date(data.retryAt).getTime());
        setResetRemainingToday(0);
        return;
      }
      setToast({
        id: Date.now(),
        kind: "error",
        message: code,
      });
      toastTimer = globalThis.setTimeout(() => setToast(null), 5000);
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
    setResetEmail(ident);
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
            <div class="card colSpan7">
              <div class="cardInner">
                <form
                  onSubmit={onSubmit}
                  class="grid"
                  style="grid-template-columns: repeat(12, 1fr); gap: 14px"
                >
                  <div class="field colSpan12">
                    <label for="identifier">
                      Email / Phone Number / Username<span class="fieldReq">*</span>
                    </label>
                    <input
                      id="identifier"
                      class={identifierError() ? "inputError" : undefined}
                      value={identifier()}
                      onInput={(e) => setIdentifier(e.currentTarget.value)}
                      onBlur={() => setTouchedIdentifier(true)}
                      autocomplete="username"
                    />
                    <Show when={identifierError()}>
                      <div class="fieldError">{identifierError()}</div>
                    </Show>
                  </div>
                  <div class="field colSpan12">
                    <label for="password">
                      Password<span class="fieldReq">*</span>
                    </label>
                    <div class="passwordRow">
                      <input
                        id="password"
                        class={`passwordInput ${passwordError() ? "inputError" : ""}`}
                        type={showPassword() ? "text" : "password"}
                        value={password()}
                        onInput={(e) => setPassword(e.currentTarget.value)}
                        onBlur={() => setTouchedPassword(true)}
                        autocomplete="current-password"
                      />
                      <button
                        class="eyeBtn"
                        type="button"
                        aria-label={showPassword() ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword() ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <title>Hide password</title>
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                            <path d="M4 4l16 16" />
                          </svg>
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <title>Show password</title>
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <Show when={passwordError()}>
                      <div class="fieldError">{passwordError()}</div>
                    </Show>
                  </div>
                  <div
                    class="colSpan12"
                    style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center"
                  >
                    <label class="rememberToggle">
                      <input
                        class="rememberInput"
                        type="checkbox"
                        checked={rememberMe()}
                        onChange={(e) => setRememberMe(e.currentTarget.checked)}
                      />
                      <span class="rememberBox" aria-hidden="true" />
                      <span class="rememberText">Remember Me</span>
                    </label>
                    {signupAllowed() ? (
                      <button
                        class="btn"
                        type="button"
                        onClick={openReset}
                        disabled={auth.loading()}
                      >
                        Forgot Password
                      </button>
                    ) : null}
                  </div>
                  {signupAllowed() ? <div /> : null}
                  <div
                    class="colSpan12"
                    style={{
                      display: "grid",
                      gap: "10px",
                      "grid-template-columns": signupAllowed() ? "1fr 1fr" : "1fr",
                    }}
                  >
                    <button
                      class="btn btnHero"
                      type="submit"
                      disabled={auth.loading()}
                      style="width: 100%"
                    >
                      <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                        {auth.loading() ? <span class="spinner" /> : null}
                        <span>{auth.loading() ? "Working…" : "Sign In"}</span>
                      </span>
                    </button>
                    {signupAllowed() ? (
                      <button
                        class="btn btnHero"
                        type="button"
                        onClick={() => navigate("/sign-up")}
                        style="width: 100%"
                      >
                        <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                          <span>Sign Up</span>
                        </span>
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>

            <div class="card colSpan5">
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
                    {!signupAllowed.loading && !signupAllowed() && detectedIp()
                      ? ` (Detected IP: ${detectedIp()})`
                      : !signupAllowed.loading && !signupAllowed() && detectedDeviceId()
                        ? ` (Detected device: ${detectedDeviceId()})`
                        : ""}
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
          <div style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px">
            Forgot Password
          </div>
          <div style="color: rgba(250,250,255,0.72); font-size: 14px; line-height: 1.55">
            Enter your email, phone number, or username to receive a reset link (expires in 1 day).
          </div>
          <div class="field">
            <label for="reset_identifier">Email / Phone Number / Username</label>
            <input
              id="reset_identifier"
              value={resetEmail()}
              onInput={(e) => setResetEmail(e.currentTarget.value)}
              autocomplete="username"
            />
          </div>
          <div
            style={{
              display: "grid",
              gap: "10px",
              "grid-template-columns": resetSent() && resetSuccessCount() < 3 ? "1fr" : "1fr 1fr",
            }}
          >
            {resetSuccessCount() >= 3 ? null : (
              <button
                class="btn btnHero"
                type="button"
                disabled={!canResend()}
                onClick={() => void requestReset()}
                style="width: 100%"
              >
                <span style="display: inline-flex; gap: 10px; align-items: center; justify-content: center; width: 100%">
                  {resetBusy() ? <span class="spinner" /> : null}
                  <span>{resetSent() ? "Resend" : "Submit"}</span>
                </span>
              </button>
            )}
            {resetSent() && resetSuccessCount() < 3 ? null : (
              <button
                class="btn btnHero"
                type="button"
                onClick={() => setResetOpen(false)}
                style="width: 100%"
              >
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
              if (retryAt && nowMs() < retryAt)
                return `Daily limit reached. Try again in ${formatCountdown(retryAt - nowMs())}.`;
              const next = resetNextAllowedAt();
              if (next && nowMs() < next)
                return `Resend available in ${formatCountdown(next - nowMs())}.`;
              const remaining = resetRemainingToday();
              if (typeof remaining === "number")
                return `Remaining resend attempts today: ${remaining}.`;
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
