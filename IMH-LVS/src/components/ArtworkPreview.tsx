// Shared artwork file preview â€” image inline, a real rendered thumbnail for
// PDFs, otherwise a "preview not available" fallback with the filename.
// Three pages each grew a near-identical version of this independently
// (ArtworkPage, ComparisonPage, QAPage); this component keeps each page's
// exact prior visual output behind a `variant`, so nothing regresses, while
// removing the duplication. New callers (e.g. ApprovalsPage) should use the
// 'dashed' (default) variant.
//
// PDFs are rendered to a static image (see usePdfThumbnail) rather than
// embedded via <iframe> with the browser's native PDF viewer â€” that takes
// several seconds to initialize and, even once loaded, shows its own
// toolbar/thumbnail-strip chrome, which looks broken or cluttered at the
// small sizes these previews render at.
import { Box, CircularProgress, Typography } from '@mui/material';
import { MdInsertDriveFile } from 'react-icons/md';
import { Artwork } from '../types/artwork';
import { usePdfThumbnail } from '../hooks/usePdfThumbnail';

type Variant = 'dashed' | 'card' | 'panel';

// Only these three fields are ever read below â€” widened from `Artwork` (via
// Pick, so every real Artwork already satisfies it) so callers can also
// preview a just-uploaded file that has no saved Artwork record yet (e.g.
// the Label Comparison Detail page's "New Artwork" card).
export type PreviewableFile = Pick<Artwork, 'fileName' | 'fileType' | 'filePath'>;

type Props = {
  artwork: PreviewableFile | undefined;
  variant?: Variant;
  height?: number; // only used by the 'card' variant
};

function NoPreview({ maxHeight, iconSize, caption }: { maxHeight: number; iconSize: number; caption?: string }) {
  return (
    <Box sx={{ height: maxHeight, display: 'grid', placeItems: 'center', textAlign: 'center', px: 2 }}>
      <Box>
        <MdInsertDriveFile size={iconSize} color="var(--c-text-3)" />
        <Typography variant="caption" sx={{ display: 'block', color: 'var(--c-text-3)', mt: 1 }}>
          {caption ?? 'Preview not available for this file.'}
        </Typography>
      </Box>
    </Box>
  );
}

// Renders a PDF artwork's first page as a static image, filling whatever
// box the caller already lays out (matches each variant's prior sizing).
function PdfThumbnail({ fileUrl, maxHeight, iconSize }: { fileUrl: string; maxHeight: number; iconSize: number }) {
  const { url, loading, error } = usePdfThumbnail(fileUrl, true);

  if (loading) {
    return (
      <Box sx={{ height: maxHeight, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={24} sx={{ color: 'var(--c-orange)' }} />
      </Box>
    );
  }
  if (error || !url) {
    return <NoPreview maxHeight={maxHeight} iconSize={iconSize} />;
  }
  return (
    <Box sx={{ height: maxHeight, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <Box component="img" src={url} alt="Artwork preview" sx={{ maxWidth: '100%', maxHeight }} />
    </Box>
  );
}

export function ArtworkPreview({ artwork, variant = 'dashed', height = 200 }: Props) {
  if (variant === 'card') {
    if (!artwork) {
      return (
        <Box sx={{ height, borderRadius: 2, bgcolor: 'var(--c-surface)', display: 'grid', placeItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
            No artwork selected.
          </Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ height, borderRadius: 2, overflow: 'hidden', bgcolor: 'var(--c-surface)' }}>
        {artwork.filePath && artwork.fileType.startsWith('image/') ? (
          <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
            <Box component="img" src={artwork.filePath} alt={artwork.fileName} sx={{ maxWidth: '100%', maxHeight: height }} />
          </Box>
        ) : artwork.filePath && artwork.fileType === 'application/pdf' ? (
          <PdfThumbnail fileUrl={artwork.filePath} maxHeight={height} iconSize={32} />
        ) : (
          <NoPreview maxHeight={height} iconSize={32} />
        )}
      </Box>
    );
  }

  if (variant === 'panel') {
    return (
      <Box sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: 'var(--c-surface)', minHeight: 220 }}>
        {artwork?.filePath && artwork.fileType.startsWith('image/') ? (
          <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
            <Box component="img" src={artwork.filePath} alt={artwork.fileName} sx={{ maxWidth: '100%', maxHeight: 320 }} />
          </Box>
        ) : artwork?.filePath && artwork.fileType === 'application/pdf' ? (
          <PdfThumbnail fileUrl={artwork.filePath} maxHeight={320} iconSize={40} />
        ) : (
          <NoPreview
            maxHeight={220}
            iconSize={40}
            caption={artwork ? undefined : 'Preview not available for this file.'}
          />
        )}
      </Box>
    );
  }

  // 'dashed' â€” QAPage's original look, also the default for new callers.
  if (!artwork) {
    return (
      <Box
        sx={{
          border: '1px dashed var(--c-border)',
          borderRadius: 3,
          minHeight: 220,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--c-text-3)',
          fontWeight: 700
        }}
      >
        LABEL PREVIEW
      </Box>
    );
  }
  if (artwork.filePath && artwork.fileType.startsWith('image/')) {
    return (
      <Box sx={{ border: '1px dashed var(--c-border)', borderRadius: 3, minHeight: 220, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <Box component="img" src={artwork.filePath} alt={artwork.fileName} sx={{ maxWidth: '100%', maxHeight: 220 }} />
      </Box>
    );
  }
  if (artwork.filePath && artwork.fileType === 'application/pdf') {
    return (
      <Box sx={{ border: '1px dashed var(--c-border)', borderRadius: 3, overflow: 'hidden' }}>
        <PdfThumbnail fileUrl={artwork.filePath} maxHeight={220} iconSize={28} />
      </Box>
    );
  }
  return (
    <Box
      sx={{
        border: '1px dashed var(--c-border)',
        borderRadius: 3,
        minHeight: 220,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--c-text-3)',
        textAlign: 'center',
        px: 2
      }}
    >
      <Box>
        <MdInsertDriveFile size={28} />
        <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 700 }}>
          {artwork.fileName || 'PREVIEW NOT AVAILABLE'}
        </Typography>
      </Box>
    </Box>
  );
}
