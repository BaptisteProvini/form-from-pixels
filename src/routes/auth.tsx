import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Mes Frais Pro" },
      { name: "description", content: "Connectez-vous à votre espace Mes Frais Pro." },
      { property: "og:title", content: "Connexion — Mes Frais Pro" },
      { property: "og:description", content: "Accès sécurisé à vos dépenses professionnelles." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/accueil", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/accueil", replace: true });
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/accueil" },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/accueil", replace: true });
        else toast.success("Vérifiez votre boîte e-mail pour confirmer votre compte.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Lien de réinitialisation envoyé.");
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Erreur";
      toast.error(m === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center font-display text-3xl font-semibold text-primary">
          Mes Frais <span className="text-accent">Pro</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
          <h1 className="text-lg font-semibold">
            {mode === "in" ? "Connexion" : mode === "up" ? "Créer un compte" : "Mot de passe oublié"}
          </h1>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "reset" && (
            <div className="space-y-1.5">
              <Label htmlFor="pw">Mot de passe</Label>
              <Input id="pw" type="password" minLength={8} required autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "…" : mode === "in" ? "Se connecter" : mode === "up" ? "Créer le compte" : "Envoyer le lien"}
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => setMode(mode === "up" ? "in" : "up")}>
              {mode === "up" ? "J'ai déjà un compte" : "Créer un compte"}
            </button>
            {mode === "in" && (
              <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => setMode("reset")}>
                Mot de passe oublié ?
              </button>
            )}
            {mode === "reset" && (
              <button type="button" className="text-muted-foreground hover:text-primary" onClick={() => setMode("in")}>Retour</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
