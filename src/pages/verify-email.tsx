import { api } from "@/utils/api";
import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [status, setStatus] = createSignal<"idle" | "working" | "ok" | "bad">("idle");
  const [detail, setDetail] = createSignal<string>("");

  createEffect(() => {
    const raw = params.token;
    const token = Array.isArray(raw) ? raw[0] : raw;
    if (!token || typeof token !== "string") {
      setStatus("bad");
      setDetail("Missing token.");
      return;
    }
    void (async () => {
      setStatus("working");
      try {
        const res = await api.get<{ ok: boolean; code?: string; alreadyVerified?: boolean }>(
          `/auth/verify-email?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          setStatus("bad");
          setDetail(res.code ?? "VERIFY_FAILED");
          return;
        }
        setStatus("ok");
        setDetail(
          res.alreadyVerified ? "Already verified. You can sign in." : "Verified. You can sign in.",
        );
      } catch (e) {
        setStatus("bad");
        setDetail(e instanceof Error ? e.message : "VERIFY_FAILED");
      }
    })();
  });

  return (
    <div class="shell">
      <div class="panel">
        <div class="panelInner">
          <div class="title">
            <h1>Email Verification</h1>
            <p>Security step: confirms ownership of the email address.</p>
          </div>

          <div class="card">
            <div class="cardInner" style="display: grid; gap: 12px">
              <div style="color: rgba(250,250,255,0.8)">
                {status() === "working" ? "Verifying…" : detail()}
              </div>
              <div class="mutedRow">
                <A class="pillLink" href="/sign-in">
                  Go to Sign In
                </A>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
