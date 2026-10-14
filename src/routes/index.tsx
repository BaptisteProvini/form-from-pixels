import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ScanLine, FileArchive, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mes Frais Pro — vos tickets, prêts pour le comptable" },
      { name: "description", content: "Photographiez vos tickets, l'IA les classe par société et prépare l'export mensuel pour votre comptable." },
      { property: "og:title", content: "Mes Frais Pro" },
      { property: "og:description", content: "Photographiez vos tickets, l'IA prépare l'export mensuel pour votre comptable." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/accueil", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-hero text-primary-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-6 py-12">
        <div className="font-display text-2xl font-semibold">
          Mes Frais <span className="text-accent">Pro</span>
        </div>
        <div className="space-y-8">
          <h1 className="font-display text-5xl font-semibold leading-[1.05]">
            Un ticket.<br />Une photo.<br /><span className="text-accent">C'est classé.</span>
          </h1>
          <ul className="space-y-3 text-primary-foreground/85">
            <li className="flex gap-3"><ScanLine className="size-5 text-accent" /> Lecture automatique par IA</li>
            <li className="flex gap-3"><Building2 className="size-5 text-accent" /> Plusieurs sociétés, données séparées</li>
            <li className="flex gap-3"><FileArchive className="size-5 text-accent" /> Export ZIP mensuel pour le comptable</li>
          </ul>
        </div>
        <Button asChild variant="accent" size="xl" className="w-full">
          <Link to="/auth">Se connecter</Link>
        </Button>
      </div>
    </div>
  );
}
