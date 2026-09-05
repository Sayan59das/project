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
      try {
        const pdfjsLib = await getPdfjs();
        const pdf = await pdfjsLib.getDocument(fileUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');
        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setState({ url: canvas.toDataURL('image/png'), loading: false, error: false });
      } catch {
        if (!cancelled) setState({ url: null, loading: false, error: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, enabled]);

  return state;
}
