
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  next_seq integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seq integer,
  ref text,
  expense_date date,
  supplier text,
  description text,
  total_ttc numeric(14,2),
  currency text NOT NULL DEFAULT 'CHF',
  amount_ht numeric(14,2),
  chf_amount numeric(14,2),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  payment_method text NOT NULL DEFAULT 'carte_pro',
  personal_advance boolean NOT NULL DEFAULT false,
  comment text,
  status text NOT NULL DEFAULT 'a_valider',
  missing_fields text[] NOT NULL DEFAULT '{}',
  exported_at timestamptz,
  modified_after_export boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, seq)
);
CREATE TABLE public.vat_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  rate numeric(5,2),
  amount numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  path text NOT NULL,
  filename text NOT NULL,
  mime text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipts_sha_idx ON public.receipts(company_id, sha256);
CREATE TABLE public.expense_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text NOT NULL,
  filename text NOT NULL,
  expense_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.period_status (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  month text NOT NULL,
  status text NOT NULL DEFAULT 'en_cours',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, month)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['companies','categories','expenses','vat_lines','receipts','expense_history','exports','period_status'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['companies','categories','expenses','vat_lines','receipts','exports','period_status'] LOOP
    EXECUTE format('CREATE POLICY "own_all" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;
CREATE POLICY "own_read" ON public.expense_history FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Ensure child rows belong to a company owned by the same user
CREATE OR REPLACE FUNCTION public.check_company_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Société invalide';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER categories_owner BEFORE INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.check_company_owner();
CREATE TRIGGER receipts_owner BEFORE INSERT OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.check_company_owner();
CREATE TRIGGER exports_owner BEFORE INSERT ON public.exports FOR EACH ROW EXECUTE FUNCTION public.check_company_owner();
CREATE TRIGGER period_owner BEFORE INSERT OR UPDATE ON public.period_status FOR EACH ROW EXECUTE FUNCTION public.check_company_owner();

-- Expense numbering DEP-0001 per company
CREATE OR REPLACE FUNCTION public.expense_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE companies SET next_seq = next_seq + 1 WHERE id = NEW.company_id AND user_id = NEW.user_id RETURNING next_seq - 1 INTO n;
  IF n IS NULL THEN RAISE EXCEPTION 'Société invalide'; END IF;
  NEW.seq := n;
  NEW.ref := 'DEP-' || lpad(n::text, 4, '0');
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_bi BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_before_insert();

CREATE OR REPLACE FUNCTION public.expense_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO expense_history(user_id, expense_id, action, changes) VALUES (NEW.user_id, NEW.id, 'creation', to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_ai AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_after_insert();

CREATE OR REPLACE FUNCTION public.expense_before_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE diff jsonb; k text; o jsonb := to_jsonb(OLD); nw jsonb;
BEGIN
  NEW.seq := OLD.seq; NEW.ref := OLD.ref; NEW.company_id := OLD.company_id; NEW.user_id := OLD.user_id;
  NEW.updated_at := now();
  nw := to_jsonb(NEW);
  diff := '{}'::jsonb;
  FOR k IN SELECT jsonb_object_keys(nw) LOOP
    IF k NOT IN ('updated_at','modified_after_export','exported_at') AND (o->k) IS DISTINCT FROM (nw->k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('avant', o->k, 'apres', nw->k));
    END IF;
  END LOOP;
  IF diff <> '{}'::jsonb THEN
    IF OLD.exported_at IS NOT NULL AND NEW.exported_at IS NOT DISTINCT FROM OLD.exported_at THEN
      NEW.modified_after_export := true;
    END IF;
    INSERT INTO expense_history(user_id, expense_id, action, changes) VALUES (OLD.user_id, OLD.id, 'modification', diff);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_bu BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_before_update();

CREATE OR REPLACE FUNCTION public.expense_before_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.exported_at IS NOT NULL THEN RAISE EXCEPTION 'Dépense déjà exportée : suppression interdite'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER expenses_bd BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_before_delete();

CREATE OR REPLACE FUNCTION public.receipt_before_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM expenses WHERE id = OLD.expense_id AND exported_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Justificatif déjà exporté : suppression interdite';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER receipts_bd BEFORE DELETE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.receipt_before_delete();

CREATE OR REPLACE FUNCTION public.expense_check_company() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories WHERE id = NEW.category_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Catégorie invalide pour cette société';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_cat BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_check_company();

-- Default categories for each new company
CREATE OR REPLACE FUNCTION public.company_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO categories(user_id, company_id, name, is_default)
  SELECT NEW.user_id, NEW.id, c, true FROM unnest(ARRAY[
    'Repas professionnels','Carburant','Parking','Transports et déplacements','Hébergement et hôtels',
    'Marketing et publicité','Informatique et logiciels','Télécommunications','Fournitures de bureau',
    'Matériel professionnel','Formation','Frais de représentation','Frais bancaires',
    'Vêtements professionnels','Entretien et réparations','Autres dépenses']) AS c;
  RETURN NEW;
END $$;
CREATE TRIGGER companies_ai AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.company_after_insert();

-- Demo companies on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO companies(user_id, name) VALUES
    (NEW.id, 'Perenity Finance Sàrl'), (NEW.id, 'Provini Properties Sàrl'), (NEW.id, 'ProVini Living');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage policies (bucket "receipts", path = <user_id>/...), no delete: originals are kept
CREATE POLICY "receipts_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "receipts_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
