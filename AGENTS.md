<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


## Mes Frais Pro architecture
- Data isolation is enforced in the database: every table carries user_id with RLS `user_id = auth.uid()`, plus triggers checking company ownership — never rely on UI filtering alone.
- Expense refs (DEP-0001), edit history and post-export flags are produced by database triggers so they cannot be bypassed by the client.
- Receipt originals live in the private `receipts` bucket under `<user_id>/<company_id>/<expense_id>/`; no storage delete policy exists so originals are never removed.
- AI receipt analysis runs only in an authenticated server function (src/lib/analyze.functions.ts) so the gateway key stays server-side.
- ZIP/XLSX export is generated in the browser (exceljs + jszip, lazily imported) to avoid worker CPU/memory limits.
- tsconfig strict extras (exactOptionalPropertyTypes, noUncheckedIndexedAccess, etc.) are disabled to keep app code concise.
