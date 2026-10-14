import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/components/company-context";
import { fetchCategories } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/reglages")({
  head: () => ({ meta: [{ title: "Réglages — Mes Frais Pro" }, { name: "description", content: "Sociétés et catégories." }, { property: "og:title", content: "Réglages — Mes Frais Pro" }, { property: "og:description", content: "Sociétés et catégories." }] }),
  component: Settings,
});

function Settings() {
  const { companies, company } = useCompany();
  const qc = useQueryClient();
  const [newCo, setNewCo] = useState("");
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const { data: cats = [] } = useQuery({ queryKey: ["categories", company?.id], queryFn: () => fetchCategories(company!.id), enabled: !!company });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["companies"] }); qc.invalidateQueries({ queryKey: ["categories"] }); };

  async function addCompany() {
    if (!newCo.trim()) return;
    const { error } = await supabase.from("companies").insert({ name: newCo.trim() });
    if (error) return toast.error(error.message);
    setNewCo(""); refresh();
  }
  async function rename() {
    if (!editing?.name.trim()) return;
    const { error } = await supabase.from("companies").update({ name: editing.name.trim() }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null); refresh();
  }
  async function delCompany(id: string, name: string) {
    const { count } = await supabase.from("expenses").select("id", { count: "exact", head: true }).eq("company_id", id);
    if (count) return toast.error(`${name} contient ${count} dépense(s) : suppression impossible pour préserver l'archive.`);
    if (!window.confirm(`Supprimer ${name} ?`)) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }
  async function addCat() {
    if (!newCat.trim() || !company) return;
    const { error } = await supabase.from("categories").insert({ name: newCat.trim(), company_id: company.id });
    if (error) return toast.error(error.message.includes("duplicate") ? "Cette catégorie existe déjà." : error.message);
    setNewCat(""); refresh();
  }
  async function delCat(id: string) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <h1 className="font-display text-3xl font-semibold text-primary">Réglages</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sociétés</h2>
        {companies.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border bg-card p-3">
            {editing?.id === c.id ? (
              <>
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} />
                <button onClick={rename} aria-label="Valider" className="p-2 text-accent"><Check className="size-4" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{c.name}</span>
                <button onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="Renommer" className="p-2 text-muted-foreground"><Pencil className="size-4" /></button>
                <button onClick={() => delCompany(c.id, c.name)} aria-label="Supprimer" className="p-2 text-muted-foreground"><Trash2 className="size-4" /></button>
              </>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="Nouvelle société" value={newCo} onChange={(e) => setNewCo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCompany()} />
          <Button onClick={addCompany}><Plus /> Ajouter</Button>
        </div>
      </section>

      {company && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Catégories — {company.name}</h2>
          <div className="flex gap-2">
            <Input placeholder="Nouvelle catégorie" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCat()} />
            <Button onClick={addCat}><Plus /> Ajouter</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span key={c.id} className="flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-sm">
                {c.name}
                {!c.is_default && <button onClick={() => delCat(c.id)} aria-label="Supprimer" className="rounded-full p-1 text-muted-foreground hover:bg-secondary"><Trash2 className="size-3" /></button>}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-secondary/50 p-4 text-xs leading-relaxed text-muted-foreground">
        Les justificatifs originaux sont conservés dans un espace privé et ne peuvent pas être supprimés depuis l'application. L'application prépare la comptabilité ; elle ne remplace pas l'avis de votre fiduciaire et sa conformité aux exigences légales de conservation n'a pas encore été vérifiée.
      </section>
    </div>
  );
}
