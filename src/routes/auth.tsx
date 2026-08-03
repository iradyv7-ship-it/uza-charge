import { useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Btn, Channel, Field, Panel, inputClass } from "@/components/uza/ui";
import { UzaMark } from "@/components/uza/ConsoleShell";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — UZA Charge Control" },
      {
        name: "description",
        content:
          "Sign in to UZA Charge to manage EV chargers, live sessions and mobile-money settlement across East Africa.",
      },
      { property: "og:title", content: "Sign in — UZA Charge Control" },
      {
        property: "og:description",
        content: "Operator, driver and admin access to the UZA Charge network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dest = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/ops";

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${dest}` },
        });
        if (err) throw err;
        if (!data.session) {
          setMessage("Check your email to confirm the account, then sign in.");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      navigate({ to: dest });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Google sign-in failed. Try email instead.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: dest });
  };

  return (
    <div className="grid-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <UzaMark />
        </div>
        <Panel className="p-6">
          <h1 className="text-lg font-semibold tracking-tight">
            {mode === "signin" ? "Console sign in" : "Create account"}
          </h1>
          <Channel className="mt-1">
            Driver, operator and UZA admin access · RWF · OCPP 1.6
          </Channel>

          <div className="mt-5 flex flex-col gap-3">
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error ? <p className="text-sm text-fault">{error}</p> : null}
            {message ? <p className="text-sm text-live">{message}</p> : null}

            <Btn variant="gold" size="lg" onClick={() => void submit()} disabled={busy}>
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
            </Btn>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" />
              <Channel>or</Channel>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Btn size="lg" onClick={() => void google()}>
              Continue with Google
            </Btn>

            <button
              type="button"
              className="channel mt-2 hover:text-foreground"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already registered? Sign in"}
            </button>
          </div>
        </Panel>
        <p className="channel mt-4 text-center">
          The first account on a fresh network is provisioned as UZA admin.
        </p>
      </div>
    </div>
  );
}
