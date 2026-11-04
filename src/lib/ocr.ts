/**
 * Lecture d'un justificatif entièrement sur l'appareil :
 * - PDF numérique : texte extrait directement (fiable) ;
 * - photo ou PDF scanné : reconnaissance de caractères (Tesseract), fichiers hébergés avec l'app.
 * Aucune donnée n'est envoyée à un service externe.
 */
import type { Worker } from "tesseract.js";
import { parseReceiptText, type AnalysisResult } from "./receipt-parser";

export type { AnalysisResult };

const asset = (p: string) => new URL(`${import.meta.env.BASE_URL}${p}`, window.location.href).href;

let workerPromise: Promise<Worker> | null = null;
let progressCb: ((msg: string) => void) | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(["fra", "deu"], 1, {
        workerPath: asset("ocr/worker.min.js"),
        corePath: asset("ocr/core"),
        langPath: asset("ocr/lang"),
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (!progressCb) return;
          const pct = Math.round((m.progress ?? 0) * 100);
          if (m.status === "recognizing text") progressCb(`Lecture du texte… ${pct} %`);
          else if (/load|initializ/i.test(m.status)) progressCb("Préparation du module de lecture…");
        },
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

async function loadBitmap(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Image illisible (format non pris en charge)"));
      img.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

/** Mise à l'échelle + niveaux de gris + contraste : améliore nettement la lecture des tickets thermiques. */
function prepareCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const target = 2000;
  const scale = Math.min(2.5, target / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 16) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(40, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.max(0, Math.min(255, ((g - min) / range) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function ocrCanvas(canvas: HTMLCanvasElement, onProgress: (m: string) => void): Promise<string> {
  progressCb = onProgress;
  try {
    const worker = await getWorker();
    onProgress("Lecture du texte…");
    const { data } = await worker.recognize(canvas);
    return data.text ?? "";
  } finally {
    progressCb = null;
  }
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
  return lib;
}

/** Texte d'un PDF numérique, ligne par ligne (regroupé par position verticale). */
async function pdfText(file: Blob): Promise<{ text: string; firstPage: HTMLCanvasElement | null }> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }]);
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of sorted) parts.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));
  }
  const text = parts.join("\n");
  let firstPage: HTMLCanvasElement | null = null;
  if ((text.match(/[\p{L}\p{N}]/gu) ?? []).length < 30) {
    // PDF scanné : on rend la première page en image pour la lire
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 2000 / Math.max(vp.width, vp.height));
    const viewport = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    await page.render({ canvasContext: c.getContext("2d")!, viewport, canvas: c } as Parameters<typeof page.render>[0]).promise;
    firstPage = c;
  }
  await doc.destroy();
  return { text, firstPage };
}

export async function analyzeLocally(file: File, categories: string[], onProgress: (msg: string) => void = () => {}): Promise<AnalysisResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    onProgress("Lecture du PDF…");
    const { text, firstPage } = await pdfText(file);
    if (!firstPage) return parseReceiptText(text, categories, { fromOcr: false });
    const ocr = await ocrCanvas(prepareCanvas(firstPage, firstPage.width, firstPage.height), onProgress);
    return parseReceiptText(ocr, categories, { fromOcr: true });
  }
  onProgress("Préparation de l'image…");
  const im = await loadBitmap(file);
  const canvas = prepareCanvas(im.src, im.w, im.h);
  im.done();
  const text = await ocrCanvas(canvas, onProgress);
  return parseReceiptText(text, categories, { fromOcr: true });
}
