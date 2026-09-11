import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Channel, Field, Panel, inputClass } from "@/components/uza/ui";
import { UzaMark } from "@/components/uza/ConsoleShell";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — UZA Charge" },
      {
        name: "description",
        content:
          "Choose a new password for your UZA Charge account after following the recovery link sent to your email.",
      },
      { property: "og:title", content: "Set a new password — UZA Charge" },
      {
        property: "og:description",
        content: "Complete password recovery for the UZA Charge console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery link puts a session in place before this screen renders.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/ops" }), 1200);
  };

  return (
    <div className="grid-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <UzaMark />
        </div>
        <Panel className="p-6">
          <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
          <Channel className="mt-1">Recovery link · UZA Charge console</Channel>

          {!ready ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Open this page from the recovery link in your email. Without that link there is no
              session to update.
            </p>
          ) : done ? (
            <p className="mt-4 text-sm text-live">Password updated. Taking you to the console…</p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              <Field label="New password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm password">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              {error ? <p className="text-sm text-fault">{error}</p> : null}
              <Btn variant="gold" size="lg" disabled={busy} onClick={() => void submit()}>
                {busy ? "Saving…" : "Save password"}
              </Btn>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
