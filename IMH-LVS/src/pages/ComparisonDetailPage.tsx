// Label Comparison Detail â€” the dedicated result page opened via "View"
// from the main page's Comparison History. Shows, in order, the Version
// Comparison (candidate artwork vs. latest approved â€” omitted with a plain
// explanation when this label had no approved baseline to compare against)
// and the Cross-Company Comparison results (always present) â€” matching the
// business workflow: Select Label -> Version Comparison (or skip) ->
// Cross-Company Comparison -> Final Result. See components/labelComparison/*
// for the individual pieces this composes.
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Paper, Typography } from '@mui/material';
import { MdArrowBack, MdFileDownload } from 'react-icons/md';
import { StatusChip } from '../components/StatusChip';
import { ArtworkCompareViewer } from '../components/labelComparison/ArtworkCompareViewer';
import { DeviationsPanel, classifyDeviation } from '../components/labelComparison/DeviationsPanel';
import { CrossCompanyResults } from '../components/labelComparison/CrossCompanyResults';
import { VisualComparisonSection } from '../components/labelComparison/VisualComparisonSection';
import { NutritionComparisonSection } from '../components/labelComparison/NutritionComparisonSection';
import { getLabelComparisonById } from '../services/labelComparisonHistoryService';
import { useArtworks } from '../hooks/useArtworks';
import { formatDateTime } from '../utils/dateFormat';
import { generateComparisonReportPdf } from '../utils/comparisonReportPdf';
import type { LabelComparisonFieldResult } from '../types/labelComparison';
import type { VersionComparisonResult } from '../types/labelComparisonRecord';

const SUMMARY_METRICS: { key: 'matching' | 'similar' | 'conflicting' | 'missing'; label: string; color: string }[] = [
  { key: 'matching', label: 'Matching', color: 'var(--c-green)' },
  { key: 'similar', label: 'Similar', color: 'var(--c-warn)' },
  { key: 'conflicting', label: 'Conflicting', color: 'var(--c-error)' },
  { key: 'missing', label: 'Missing', color: 'var(--c-info)' }
];

// Artwork.version is already stored as "V1"/"V2" (see types/artwork.ts) â€” this
// normalizes any of that, a bare number, or an already-lowercase "v1" into a
// single consistent "v1" display form, so it's never doubled into "vV1".
function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

function summarizeFields(fields: LabelComparisonFieldResult[]) {
  const counts = { matching: 0, similar: 0, conflicting: 0, missing: 0, notCompared: 0 };
  fields.forEach((field) => {
    const status = classifyDeviation(field);
    if (status === 'MATCH') counts.matching += 1;
    else if (status === 'SIMILAR') counts.similar += 1;
    else if (status === 'CONFLICT') counts.conflicting += 1;
    else if (status === 'MISSING') counts.missing += 1;
    else counts.notCompared += 1;
  });
  return counts;
}

export function ComparisonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const run = id ? getLabelComparisonById(id) : undefined;

  // Both artworks are reads now, and this page only needs them for the preview
  // panel — so it renders without them and fills the previews in when they
  // arrive, rather than blocking the comparison result behind two requests.
  const { byId: artworkById } = useArtworks();
  const candidateArtwork = artworkById(run?.candidateArtworkId);
  const approvedArtwork = artworkById(run?.versionComparison?.approvedArtworkId);
  const summary = run?.versionComparison ? summarizeFields(run.versionComparison.result.comparison.fields) : null;

  if (!run) {
    return (
      <Box>
        <Button startIcon={<MdArrowBack />} sx={{ textTransform: 'none', mb: 2 }} component={RouterLink} to="/comparison">
          Back to Label Comparison
        </Button>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: 'var(--c-text-2)', fontWeight: 700 }}>
            Comparison not found
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mt: 0.5 }}>
            This comparison may have been removed, or the link is incorrect.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleDownloadReport = async () => {
    setReportError(null);
    setReportGenerating(true);
    try {
      await generateComparisonReportPdf(run, { candidate: candidateArtwork, approved: approvedArtwork });
    } catch (error) {
      console.error('[ComparisonDetailPage] Could not generate the comparison PDF report:', error);
      setReportError('Could not generate the PDF report. Please try again.');
    } finally {
      setReportGenerating(false);
    }
  };

  const versionComparison: VersionComparisonResult | undefined = run.versionComparison;

  return (
    <Box>
      <Button startIcon={<MdArrowBack />} sx={{ textTransform: 'none', mb: 2 }} component={RouterLink} to="/comparison">
        Back to Label Comparison
      </Button>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Label Comparison Detail
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 1.5 }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Product
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {run.productName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Party
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {run.marketingCompany}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Comparison ID
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {run.id}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Status
                </Typography>
                <StatusChip status="Completed" />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Compared On
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {formatDateTime(run.comparisonDate)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                  Best Cross-Company Match
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>
                  {run.bestCrossCompanyMatch
                    ? `${run.bestCrossCompanyMatch.candidateMarketingCompany} (${run.bestCrossCompanyMatch.overallPercentage}%)`
                    : 'No Comparison Available'}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Button variant="outlined" startIcon={<MdFileDownload />} sx={{ textTransform: 'none' }} onClick={handleDownloadReport} disabled={reportGenerating}>
              {reportGenerating ? 'Generating PDF...' : 'Download Report (PDF)'}
            </Button>
            {reportError && (
              <Typography variant="caption" sx={{ color: 'var(--c-error)', display: 'block', mt: 0.5 }}>
                {reportError}
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      {versionComparison ? (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: 'var(--c-text-3)', letterSpacing: 1 }}>
                Label Artwork
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Version:</strong> {formatVersionLabel(versionComparison.candidateArtworkVersion)}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>Filename:</strong> {versionComparison.candidateArtworkFileName}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: 'var(--c-text-3)', letterSpacing: 1 }}>
                Latest Approved Artwork
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>Version:</strong> {formatVersionLabel(versionComparison.approvedArtworkVersion)}
              </Typography>
              <Box sx={{ my: 1 }}>
                <StatusChip status={versionComparison.approvedArtworkStatus} />
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>Approved:</strong> {formatDateTime(versionComparison.approvedArtworkApprovedDate)}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <strong>Filename:</strong> {versionComparison.approvedArtworkFileName}
              </Typography>
            </Paper>
          </Box>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ textAlign: 'center', mb: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'var(--c-text-3)', letterSpacing: 1.2 }}>
                Overall Match
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, color: 'var(--c-orange)' }}>
                {versionComparison.result.comparison.overallPercentage}%
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
              {SUMMARY_METRICS.map((metric) => (
                <Box key={metric.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, border: '1px solid var(--c-border)', borderRadius: 2, p: 1.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: metric.color, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block' }}>
                      {metric.label}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--c-text-1)' }}>
                      {summary![metric.key]}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>

          <VisualComparisonSection visualComparison={versionComparison.visualComparison} />
          <NutritionComparisonSection
            nutritionComparison={versionComparison.result.comparison.nutritionComparison}
            newLabel="Label Artwork"
            approvedLabel="Latest Approved"
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3, mb: 3 }}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Artwork Preview
              </Typography>
              <ArtworkCompareViewer newFile={candidateArtwork} approvedFile={approvedArtwork} newLabel="Label Artwork" approvedLabel="Latest Approved" />
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                Deviations
              </Typography>
              <DeviationsPanel fields={versionComparison.result.comparison.fields} newLabel="Label Artwork" approvedLabel="Latest Approved" />
            </Paper>
          </Box>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              Field Comparison
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <Box component="thead">
                  <Box component="tr" sx={{ bgcolor: 'var(--c-tint-blue)' }}>
                    {['Parameter', 'Label Artwork', 'Latest Approved', 'Status'].map((heading) => (
                      <Box component="th" key={heading} sx={{ textAlign: 'left', p: 1.5, fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--c-border)' }}>
                        {heading}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {versionComparison.result.comparison.fields.map((field) => (
                    <Box component="tr" key={field.field} sx={{ '&:hover': { bgcolor: 'var(--c-surface)' } }}>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid var(--c-border)', fontWeight: 600, fontSize: 14 }}>
                        {field.label}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid var(--c-border)', fontSize: 14 }}>
                        {field.labelA || 'â€”'}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid var(--c-border)', fontSize: 14 }}>
                        {field.labelB || 'â€”'}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid var(--c-border)' }}>
                        <StatusChip status={classifyDeviation(field)} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
              Compared against Latest Approved â€” {formatVersionLabel(versionComparison.approvedArtworkVersion)}
            </Typography>
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Version Comparison
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
            No previous approved version was found for this label ({run.candidateArtworkFileName},{' '}
            {formatVersionLabel(run.candidateArtworkVersion)}) â€” version comparison has been skipped. Proceeding directly to
            Cross-Company Comparison below.
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Cross-Company Comparison
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: 2 }}>
          {run.productName} ({run.marketingCompany}) compared against similar labels belonging to other marketing companies.
        </Typography>
        <CrossCompanyResults results={run.crossCompanyResults} />
      </Paper>
    </Box>
  );
}
