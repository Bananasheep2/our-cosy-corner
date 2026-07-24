"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../supabase-public";

// Supabase's password-recovery email links land here with the session token
// in the URL *fragment* (`#access_token=...&type=recovery`), never the query
// string — fragments never reach a server, so this has to run client-side
// and read window.location.hash itself once the page has mounted.
type Stage = "checking" | "form" | "submitting" | "success" | "invalid";

function parseAccessToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.get("type") !== "recovery") return null;
  return params.get("access_token");
}

// Supabase can report a failure in either the fragment or the query string
// (expired link, already-used link, redirect not allow-listed…). Showing its
// real wording beats a blanket "invalid or expired", which previously hid the
// actual cause and made a working link look broken.
function parseLinkError(hash: string, search: string): string | null {
  const fromHash = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const fromQuery = new URLSearchParams(search);
  for (const p of [fromHash, fromQuery]) {
    const desc = p.get("error_description") || p.get("error");
    if (desc) return desc.replace(/\+/g, " ");
  }
  // A PKCE-style link: the code can only be exchanged by the client that
  // started the flow, which is the desktop app, not this browser.
  if (fromQuery.get("code")) {
    return "This link was created by an older version of the app. Please update Our Cosy Corner and request a new reset link.";
  }
  return null;
}

// Newer Supabase email templates can link with `?token_hash=...&type=recovery`
// instead of putting the session in the fragment. Trading that hash for a real
// access token keeps both link shapes working.
async function verifyTokenHash(tokenHash: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recovery", token_hash: tokenHash }),
    });
    if (!res.ok) return null;
    const data: { access_token?: string } = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

function validatePassword(v: string): string | null {
  if (v.length < 8) return "Password needs to be at least 8 characters.";
  return null;
}
function validateConfirm(v: string, password: string): string | null {
  if (v.length < 8) return "Password needs to be at least 8 characters.";
  if (v !== password) return "Passwords don't match.";
  return null;
}

export default function ResetPage() {
  const [{ stage, accessToken }, setTokenState] = useState<{ stage: Stage; accessToken: string | null }>({
    stage: "checking",
    accessToken: null,
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  // Supabase's own wording for a bad link, when it gives us one.
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);

  // setStage: updates only the `stage` half of the combined state (declared
  // as one useState so the initial-mount effect below only ever needs one
  // setState call, not two).
  function setStage(next: Stage) {
    setTokenState((prev) => ({ ...prev, stage: next }));
  }

  useEffect(() => {
    // Reading the recovery token genuinely requires an effect: the token
    // lives in the URL *fragment* (never sent to/knowable by the server, so
    // it can't be derived during the render that produces the SSR/first
    // client-render markup) and window.location is only available once
    // mounted in the browser. There's exactly one synchronous setState call
    // here (not a chain reacting to other state), so this is the effect this
    // lint rule is meant to allow, not the cascading-render pattern it warns
    // against.
    const token = parseAccessToken(window.location.hash);
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setTokenState({ stage: "form", accessToken: token });
      return;
    }

    const linkError = parseLinkError(window.location.hash, window.location.search);
    if (linkError) {
      setLinkErrorMessage(linkError);
      setTokenState({ stage: "invalid", accessToken: null });
      return;
    }

    // No token and no error yet: it may be a `?token_hash=` style link, which
    // needs one round-trip to exchange. Anything else really is invalid.
    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    if (!tokenHash) {
      setTokenState({ stage: "invalid", accessToken: null });
      return;
    }
    let cancelled = false;
    verifyTokenHash(tokenHash).then((exchanged) => {
      if (cancelled) return;
      setTokenState(exchanged
        ? { stage: "form", accessToken: exchanged }
        : { stage: "invalid", accessToken: null });
    });
    return () => { cancelled = true; };
  }, []);

  function onPasswordBlur() {
    if (!password) { setPasswordError(null); return; }
    setPasswordError(validatePassword(password));
  }
  function onConfirmBlur() {
    if (!confirm) { setConfirmError(null); return; }
    setConfirmError(validateConfirm(confirm, password));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const pwErr = validatePassword(password);
    const cfErr = validateConfirm(confirm, password);
    setPasswordError(pwErr);
    setConfirmError(cfErr);
    if (pwErr || cfErr || !accessToken) return;

    setServerError(null);
    setStage("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (res.status === 401) {
        setStage("invalid");
        return;
      }
      if (!res.ok) {
        let msg = "Something went wrong — try again.";
        try {
          const data: { msg?: string; message?: string; error_description?: string } = await res.json();
          msg = data.msg || data.message || data.error_description || msg;
        } catch {
          /* non-JSON error body — fall back to the generic message */
        }
        setServerError(msg);
        setStage("form");
        return;
      }
      setStage("success");
    } catch {
      setServerError("Couldn't reach the server — check your connection and try again.");
      setStage("form");
    }
  }

  return (
    <main className="simple-page auth-page">
      <header className="page-nav shell">
        <Link className="brand" href="/">
          <span><img className="brand-logo" src="/brand-mark.png" alt="" width={64} height={64} /></span>{" "}
          Our Cosy Corner
        </Link>
        <Link href="/">Back home <b>→</b></Link>
      </header>

      <section className="simple-hero shell">
        <div className="eyebrow">reset your password</div>
        <h1>Set a new<br /><em>password.</em></h1>
      </section>

      <section className="auth-panel shell">
        {stage === "checking" && <p className="auth-result">Checking your link…</p>}

        {stage === "invalid" && (
          <p className="auth-result is-error">
            {linkErrorMessage || "This reset link is invalid or has expired. Request a new one from the app."}
          </p>
        )}

        {stage === "success" && (
          <p className="auth-result">
            Your password&rsquo;s updated — head back to <strong>Our Cosy Corner</strong> and sign in.
          </p>
        )}

        {(stage === "form" || stage === "submitting") && (
          <form onSubmit={onSubmit} noValidate>
            <p className="auth-intro">Choose a new password for your account.</p>

            <div className="auth-field">
              <label htmlFor="reset-password">New password</label>
              <div className="password-row">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  inputMode="text"
                  autoComplete="new-password"
                  placeholder="at least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={onPasswordBlur}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? "reset-password-error" : undefined}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "hide password" : "show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "hide" : "show"}
                </button>
              </div>
              {passwordError && <p className="auth-error" id="reset-password-error">{passwordError}</p>}
            </div>

            <div className="auth-field">
              <label htmlFor="reset-confirm">Confirm password</label>
              <div className="password-row">
                <input
                  id="reset-confirm"
                  type={showConfirm ? "text" : "password"}
                  inputMode="text"
                  autoComplete="new-password"
                  placeholder="type it again"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onBlur={onConfirmBlur}
                  aria-invalid={confirmError ? true : undefined}
                  aria-describedby={confirmError ? "reset-confirm-error" : undefined}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  aria-pressed={showConfirm}
                  aria-label={showConfirm ? "hide password" : "show password"}
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? "hide" : "show"}
                </button>
              </div>
              {confirmError && <p className="auth-error" id="reset-confirm-error">{confirmError}</p>}
            </div>

            {serverError && <p className="auth-error">{serverError}</p>}

            <button type="submit" className="button auth-submit" disabled={stage === "submitting"}>
              {stage === "submitting" ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
