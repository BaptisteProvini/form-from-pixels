import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Mes Frais Pro" },
      { name: "description", content: "Définissez un nouveau mot de passe." },
      { property: "og:title", content: "Nouveau mot de passe — Mes Frais Pro" },
      { property: "og:description", content: "Réinitialisation du mot de passe." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour.");
    navigate({ to: "/accueil" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-lg font-semibold">Nouveau mot de passe</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Mot de passe</Label>
          <Input id="pw" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button className="w-full" size="lg" disabled={busy}>Enregistrer</Button>
      </form>
    </div>
  );
}
