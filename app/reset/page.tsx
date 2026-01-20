"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const router = useRouter();

  // When a user arrives via the reset email link, Supabase will establish a session
  // in the browser (often via URL hash tokens). We just need to detect that session.
  useEffect(() => {
    let unsub: { unsubscribe: () => void } | null = null;

    async function init() {
      setErr("");
      setMsg("");

      // 1) Check if we already have a session
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setErr(error.message);
        setReady(true);
        return;
      }

      if (data.session) {
        setHasSession(true);
        setReady(true);
        return;
      }

      // 2) If not, listen for auth state changes (PASSWORD_RECOVERY usually lands here)
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setHasSession(true);
          setReady(true);
        }
      });

      unsub = sub.subscription;

      // Give it a moment in case the session is being established
      setTimeout(async () => {
        const { data: s2 } = await supabase.auth.getSession();
        setHasSession(!!s2.session);
        setReady(true);
      }, 300);
    }

    init();

    return () => {
      if (unsub) unsub.unsubscribe();
    };
  }, []);

  async function setNewPassword() {
    setErr("");
    setMsg("");

    if (!password || password.length < 8) {
        setErr("Password must be at least 8 characters.");
        return;
    }
    if (password !== confirm) {
        setErr("Passwords do not match.");
        return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        setErr(error.message);
        return;
    }

    setMsg("Password updated! Redirecting to sign in…");

    await supabase.auth.signOut();

    setTimeout(() => {
        router.replace("/");
    }, 2000);
    }

  return (
    <div className="min-h-screen spider-bg bg-gradient-to-b from-red-700 to-blue-900 flex items-center justify-center p-6">
      <div className="spider-card w-full max-w-md p-6">
        <h1 className="text-2xl font-extrabold text-white">Reset Password</h1>
        <p className="text-sm spider-muted mt-2">
          Set a new password for your account.
        </p>

        {!ready ? (
          <p className="text-sm spider-muted mt-4">Loading…</p>
        ) : !hasSession ? (
          <div className="mt-4">
            <p className="text-sm text-red-200 font-semibold">
              This reset link is missing or expired.
            </p>
            <p className="text-sm spider-muted mt-2">
              Go back and request a new password reset email.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <input
              className="spider-input rounded-xl p-3 w-full"
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              className="spider-input rounded-xl p-3 w-full"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />

            <button
              onClick={setNewPassword}
              className="spider-btn spider-primary px-4 py-3 w-full font-extrabold"
            >
              Save new password
            </button>

            {err ? <p className="text-sm text-red-200 font-semibold">{err}</p> : null}
            {msg ? <p className="text-sm text-emerald-200 font-semibold">{msg}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
