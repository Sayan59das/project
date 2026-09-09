import { useEffect, useState } from 'react';

// pdf.js (and its worker) are loaded lazily, on first actual use, and
// cached here — this keeps the fairly large pdf.js bundle out of the main
// app chunk for users who never open an artwork preview.
let pdfjsLibPromise: ReturnType<typeof loadPdfjs> | null = null;

async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}

function getPdfjs() {
  if (!pdfjsLibPromise) pdfjsLibPromise = loadPdfjs();
  return pdfjsLibPromise;
}

// Renders a PDF's first page (given its object/blob/data URL) to a static
// PNG data URL. Extracted as a plain function (not just inlined in the hook
// below) so non-React callers — the comparison PDF report generator, which
// runs from a button click handler, not a component render — can reuse the
// exact same rendering path rather than duplicating it.
export async function renderPdfFirstPageToDataUrl(fileUrl: string): Promise<string | null> {
  try {
    const pdfjsLib = await getPdfjs();
    // withCredentials: true — artwork files are served from an
    // auth-protected backend endpoint (/api/artworks/:id/file, behind
    // requireSession's httpOnly cookie). pdf.js's own networking layer does
    // not send credentials by default even for a same-origin-looking URL,
    // so without this every real uploaded artwork's PDF request comes back
    // 401 and the preview silently falls back to "not available" — a blob:
    // URL (the not-yet-saved file straight from the upload dialog) ignores
    // this option harmlessly, so it's safe to always pass it.
    const pdf = await pdfjsLib.getDocument({ url: fileUrl, withCredentials: true }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

type ThumbnailState = { url: string | null; loading: boolean; error: boolean };

// Renders a PDF's first page (given its object/blob URL) to a static PNG
// data URL. Used so artwork preview panels show a real, fast, static image
// of the label instead of embedding the browser's native PDF viewer in an
// iframe — that takes several seconds to initialize and, even once
// loaded, shows its own toolbar/thumbnail-strip chrome, which looks broken
// or cluttered at the small sizes these previews render at.
export function usePdfThumbnail(fileUrl: string | undefined, enabled: boolean): ThumbnailState {
  const [state, setState] = useState<ThumbnailState>({ url: null, loading: false, error: false });

  useEffect(() => {
    if (!enabled || !fileUrl) {
      setState({ url: null, loading: false, error: false });
      return;
    }

    let cancelled = false;
    setState({ url: null, loading: true, error: false });

    (async () => {
      const url = await renderPdfFirstPageToDataUrl(fileUrl);
      if (cancelled) return;
      if (url) setState({ url, loading: false, error: false });
      else setState({ url: null, loading: false, error: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, enabled]);

  return state;
}
