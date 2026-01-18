import { A, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, onMount } from "solid-js";
import { api } from "../utils/api";

export default function SignUp() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = createSignal<boolean | null>(null);
  const [username, setUsername] = createSignal(localStorage.getItem("signup.username") ?? "");
  const [email, setEmail] = createSignal(localStorage.getItem("signup.email") ?? "");
  const [password, setPassword] = createSignal("");
  const [status, setStatus] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [checkingTooLong, setCheckingTooLong] = createSignal(false);

  onMount(() => {
    void (async () => {
      try {
        const slowTimer = setTimeout(() => setCheckingTooLong(true), 2500);
        const res = await api.get<{ allowed: boolean }>("/auth/signup-allowed");
        clearTimeout(slowTimer);
        setAllowed(res.allowed);
        if (!res.allowed) navigate("/sign-in", { replace: true });
      } catch {
        setAllowed(false);
        navigate("/sign-in", { replace: true });
      }
    })();
  });

  createEffect(() => {
    localStorage.setItem("signup.username", username());
  });
  createEffect(() => {
    localStorage.setItem("signup.email", email());
  });

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; code?: string }>("/auth/signup", {
        username: username(),
        email: email(),
        password: password()
      });
      if (!res.ok) {
        setStatus(res.code ?? "SIGNUP_FAILED");
        setBusy(false);
        return;
      }
      setStatus("Check your email for a verification link. Login is disabled until verified.");
      localStorage.removeItem("signup.username");
      localStorage.removeItem("signup.email");
      setBusy(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "SIGNUP_FAILED");
      setBusy(false);
    }
  };

  if (allowed() === null)
    return (
      <div class="shell">
        <div class="panel">
          <div class="panelInner">
            <div class="title">
              <h1>Checking Access…</h1>
              <p>Sign up is only visible to allow-listed IP addresses.</p>
            </div>
            <div class="card">
              <div class="cardInner">
                <div style="display: flex; gap: 10px; align-items: center; color: rgba(250,250,255,0.76); font-size: 14px">
                  <span class="spinner" />
                  <span>Please wait.</span>
                </div>
                {checkingTooLong() ? (
                  <div style="color: rgba(250,250,255,0.68); font-size: 13px; line-height: 1.5; margin-top: 10px">
                    Still waiting for the server. Make sure the backend is running on http://localhost:3001.
                  </div>
                ) : null}
                <A class="pillLink" href="/sign-in">
                  Back to Sign In
                </A>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  if (allowed() === false) return null;

  return (
    <div class="shell">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <h1>Sign Up</h1>
            <p>Access is restricted by IP allow-list. If you reached this page, your IP is allowed.</p>
          </div>

          <div class="grid">
            <div class="card" style="grid-column: span 7">
              <div class="cardInner">
                <form onSubmit={onSubmit} class="grid" style="grid-template-columns: repeat(12, 1fr); gap: 14px">
                  <div class="field" style="grid-column: span 12">
                    <label>Username</label>
                    <input value={username()} onInput={(e) => setUsername(e.currentTarget.value)} autocomplete="username" />
                  </div>
                  <div class="field" style="grid-column: span 12">
                    <label>Email</label>
                    <input value={email()} onInput={(e) => setEmail(e.currentTarget.value)} autocomplete="email" />
                  </div>
                  <div class="field" style="grid-column: span 12">
                    <label>Password</label>
                    <input
                      type="password"
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                      autocomplete="new-password"
                    />
                  </div>
                  <div style="grid-column: span 12; display: flex; gap: 10px; align-items: center; justify-content: space-between">
                    <button class="btn btnHero" type="submit" disabled={busy()}>
                      <span style="display: inline-flex; gap: 10px; align-items: center">
                        {busy() ? <span class="spinner" /> : null}
                        <span>{busy() ? "Working…" : "Sign Up"}</span>
                      </span>
                    </button>
                    <A class="pillLink" href="/sign-in">
                      Back to Sign In
                    </A>
                  </div>
                  {status() ? (
                    <div style="grid-column: span 12; color: rgba(250,250,255,0.76); font-size: 14px">{status()}</div>
                  ) : null}
                </form>
              </div>
            </div>

            <div class="card" style="grid-column: span 5">
              <div class="cardInner">
                <div style="display: grid; gap: 12px">
                  <div style="font-weight: 600; letter-spacing: -0.01em">Verification</div>
                  <div style="color: rgba(250,250,255,0.68); line-height: 1.5; font-size: 14px">
                    A verification link is emailed to you and expires in about 1 day. Until verified, login is blocked.
                  </div>
                  <div style="height: 1px; background: rgba(255,255,255,0.12)" />
                  <div style="color: rgba(250,250,255,0.68); line-height: 1.5; font-size: 14px">
                    If you did not receive the email, check spam or contact your admin to re-issue a link.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
