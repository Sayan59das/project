// Real, working artwork preview controls for the Label Comparison Detail
// page — Side by Side (default), Overlay/Flicker, Zoom, Fit to Screen and
// Full Screen. All operate purely client-side on whichever preview images
// are actually available (the just-uploaded file's session-scoped object
// URL, and the approved artwork's own filePath) — there is no fake visual
// diffing here (no highlighted regions, no pixel comparison): this is a
// viewing aid, not a claim that the system has determined WHERE two
// artworks differ. Overlay is automatically disabled when either side has
// no retrievable preview, rather than pretending to compare a blank panel.
import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { MdCloseFullscreen, MdCompareArrows, MdCropFree, MdInsertDriveFile, MdOpenInFull, MdZoomIn, MdZoomOut } from 'react-icons/md';
import { usePdfThumbnail } from '../../hooks/usePdfThumbnail';
import type { PreviewableFile } from '../ArtworkPreview';

function useResolvedImage(file?: PreviewableFile): { url: string | undefined; loading: boolean } {
  const isPdf = file?.fileType === 'application/pdf';
  const pdfState = usePdfThumbnail(isPdf ? file?.filePath : undefined, Boolean(isPdf && file?.filePath));
  if (!file || !file.filePath) return { url: undefined, loading: false };
  if (file.fileType.startsWith('image/')) return { url: file.filePath, loading: false };
  if (isPdf) return { url: pdfState.url ?? undefined, loading: pdfState.loading };
  return { url: undefined, loading: false };
}

function PreviewImage({ file, zoom }: { file?: PreviewableFile; zoom: number }) {
  const { url, loading } = useResolvedImage(file);

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <CircularProgress size={22} sx={{ color: '#E26737' }} />
      </Box>
    );
  }
  if (!url) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', color: '#9EA4AB', textAlign: 'center', p: 2 }}>
        <Box>
          <MdInsertDriveFile size={28} />
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
            Preview not available for this file.
          </Typography>
        </Box>
      </Box>
    );
  }
  return (
    <Box sx={{ overflow: 'auto', height: '100%', display: 'grid', justifyItems: 'center', alignContent: 'start', p: 1 }}>
      <Box component="img" src={url} alt="Artwork preview" sx={{ maxWidth: 'none', width: `${zoom}%` }} />
    </Box>
  );
}

type ViewMode = 'side-by-side' | 'overlay';

type Props = {
  newFile?: PreviewableFile;
  approvedFile?: PreviewableFile;
  newLabel: string;
  approvedLabel: string;
};

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;

export function ArtworkCompareViewer({ newFile, approvedFile, newLabel, approvedLabel }: Props) {
  const [mode, setMode] = useState<ViewMode>('side-by-side');
  const [overlayShowNew, setOverlayShowNew] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);

  const canOverlay = Boolean(newFile?.filePath && approvedFile?.filePath);

  const toolbarButtonSx = (active: boolean) =>
    active ? { textTransform: 'none' as const, bgcolor: '#2E3135', '&:hover': { bgcolor: '#1f2124' } } : { textTransform: 'none' as const, color: '#6B7177', borderColor: '#D8DDE3' };

  return (
    <Box
      sx={
        fullscreen
          ? { position: 'fixed', inset: 0, bgcolor: '#fff', zIndex: 1300, display: 'flex', flexDirection: 'column', p: 2 }
          : { display: 'flex', flexDirection: 'column' }
      }
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" variant={mode === 'side-by-side' ? 'contained' : 'outlined'} sx={toolbarButtonSx(mode === 'side-by-side')} onClick={() => setMode('side-by-side')}>
            Side by Side
          </Button>
          <Tooltip title={canOverlay ? '' : 'Both artworks need a retrievable preview to overlay'}>
            <span>
              <Button
                size="small"
                variant={mode === 'overlay' ? 'contained' : 'outlined'}
                disabled={!canOverlay}
                sx={toolbarButtonSx(mode === 'overlay')}
                onClick={() => setMode('overlay')}
              >
                Overlay / Flicker
              </Button>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN}>
                <MdZoomOut size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ color: '#6B7177', minWidth: 36, textAlign: 'center' }}>
            {zoom}%
          </Typography>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX}>
                <MdZoomIn size={18} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Fit to Screen">
            <IconButton size="small" onClick={() => setZoom(100)}>
              <MdCropFree size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title={fullscreen ? 'Exit Full Screen' : 'Full Screen'}>
            <IconButton size="small" onClick={() => setFullscreen((f) => !f)}>
              {fullscreen ? <MdCloseFullscreen size={18} /> : <MdOpenInFull size={18} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {mode === 'side-by-side' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, flex: 1, minHeight: 0 }}>
          {[
            { label: newLabel, file: newFile },
            { label: approvedLabel, file: approvedFile }
          ].map((panel) => (
            <Box
              key={panel.label}
              sx={{ border: '1px solid #D8DDE3', borderRadius: 3, overflow: 'hidden', bgcolor: '#EEF1F4', height: fullscreen ? '100%' : 320, display: 'flex', flexDirection: 'column' }}
            >
              <Typography variant="caption" sx={{ display: 'block', p: 1, fontWeight: 700, color: '#6B7177', bgcolor: '#fff', borderBottom: '1px solid #D8DDE3' }}>
                {panel.label}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <PreviewImage file={panel.file} zoom={zoom} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            <Button size="small" sx={{ textTransform: 'none', color: '#6B7177' }} onClick={() => setOverlayShowNew((value) => !value)} startIcon={<MdCompareArrows />}>
              Showing: {overlayShowNew ? newLabel : approvedLabel} (click to flicker)
            </Button>
          </Box>
          <Box sx={{ border: '1px solid #D8DDE3', borderRadius: 3, overflow: 'hidden', bgcolor: '#EEF1F4', flex: 1, minHeight: fullscreen ? 0 : 320 }}>
            <PreviewImage file={overlayShowNew ? newFile : approvedFile} zoom={zoom} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
