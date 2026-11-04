// Copie les fichiers du module de lecture (Tesseract) dans public/ocr pour qu'ils soient
// servis par l'application elle-même : aucun appel à un serveur externe au moment du scan.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = "public/ocr";
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

// Worker
const tess = pkgDir("tesseract.js");
cpSync(join(tess, "dist", "worker.min.js"), join(out, "worker.min.js"));

// Cœur WebAssembly (toutes les variantes : le navigateur choisit la bonne)
const core = pkgDir("tesseract.js-core");
for (const f of readdirSync(core)) {
  if (/^tesseract-core.*\.(wasm|wasm\.js|js)$/.test(f)) cpSync(join(core, f), join(out, "core", f));
}

// Langues (version « best_int » : bon compromis précision / taille)
function findTrained(dir, lang) {
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === `${lang}.traineddata.gz`) hits.push(p);
    }
  };
  walk(dir);
  return hits.find((p) => p.includes("best_int")) ?? hits.find((p) => !p.includes("best")) ?? hits[0];
}
for (const lang of ["fra", "deu"]) {
  const file = findTrained(pkgDir(`@tesseract.js-data/${lang}`), lang);
  if (!file || !existsSync(file)) throw new Error(`Données de langue introuvables : ${lang}`);
  cpSync(file, join(out, "lang", `${lang}.traineddata.gz`));
  console.log(`ocr: ${lang} <- ${file}`);
}
console.log("ocr: fichiers copiés dans", out);
