import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCompanies, type Company } from "@/lib/data";

type Ctx = {
  companies: Company[];
  company: Company | null;
  setCompanyId: (id: string) => void;
  isLoading: boolean;
};

const CompanyContext = createContext<Ctx | null>(null);
const KEY = "mfp.company";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: companies = [], isLoading } = useQuery({ queryKey: ["companies"], queryFn: fetchCompanies });
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    setId(localStorage.getItem(KEY));
  }, []);

  const company = useMemo(
    () => companies.find((c) => c.id === id) ?? companies[0] ?? null,
    [companies, id],
  );

  // Persist the effective selection so every page uses the same company.
  useEffect(() => {
    if (company && company.id !== id) {
      localStorage.setItem(KEY, company.id);
      setId(company.id);
    }
  }, [company, id]);

  const value: Ctx = {
    companies,
    company,
    isLoading,
    setCompanyId: (v) => {
      localStorage.setItem(KEY, v);
      setId(v);
    },
  };
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const c = useContext(CompanyContext);
  if (!c) throw new Error("useCompany outside provider");
  return c;
}
