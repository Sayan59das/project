// Label Comparison Detail — the dedicated result page opened via "View"
// from the main page's Comparison History. Shows, in order, the Version
// Comparison (candidate artwork vs. latest approved — omitted with a plain
// explanation when this label had no approved baseline to compare against)
// and the Cross-Company Comparison results (always present) — matching the
// business workflow: Select Label -> Version Comparison (or skip) ->
// Cross-Company Comparison -> Final Result. See components/labelComparison/*
// for the individual pieces this composes.
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Paper, Typography } from '@mui/material';
import { MdArrowBack, MdFileDownload } from 'react-icons/md';
import { StatusChip } from '../components/StatusChip';
import { ArtworkCompareViewer } from '../components/labelComparison/ArtworkCompareViewer';
import { DeviationsPanel, classifyDeviation } from '../components/labelComparison/DeviationsPanel';
import { CrossCompanyResults } from '../components/labelComparison/CrossCompanyResults';
import { getLabelComparisonById } from '../services/labelComparisonHistoryService';
import { getArtworkById } from '../services/artworkService';
import { formatDateTime } from '../utils/dateFormat';
import { generateComparisonPDF } from '../utils/pdfGenerator';
import type { Artwork } from '../types/artwork';
import type { LabelComparisonFieldResult } from '../types/labelComparison';
import type { VersionComparisonResult } from '../types/labelComparisonRecord';

const SUMMARY_METRICS: { key: 'matching' | 'modified' | 'conflicting' | 'missing'; label: string; color: string }[] = [
  { key: 'matching', label: 'Matching', color: '#00A651' },
  { key: 'modified', label: 'Modified', color: '#E29B17' },
  { key: 'conflicting', label: 'Conflicting', color: '#D32F2F' },
  { key: 'missing', label: 'Missing', color: '#1976D2' }
];

// Artwork.version is already stored as "V1"/"V2" (see types/artwork.ts) — this
// normalizes any of that, a bare number, or an already-lowercase "v1" into a
// single consistent "v1" display form, so it's never doubled into "vV1".
function formatVersionLabel(version: string): string {
  const digits = version.replace(/\D/g, '');
  return `v${digits || version}`;
}

function summarizeFields(fields: LabelComparisonFieldResult[]) {
  const counts = { matching: 0, modified: 0, conflicting: 0, missing: 0, notCompared: 0 };
  fields.forEach((field) => {
    const status = classifyDeviation(field);
    if (status === 'MATCH') counts.matching += 1;
    else if (status === 'MODIFIED') counts.modified += 1;
    else if (status === 'CONFLICTING') counts.conflicting += 1;
    else if (status === 'MISSING') counts.missing += 1;
    else counts.notCompared += 1;
  });
  return counts;
}

export function ComparisonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const run = id ? getLabelComparisonById(id) : undefined;

  const [candidateArtwork, setCandidateArtwork] = useState<Artwork | undefined>(undefined);
  const [approvedArtwork, setApprovedArtwork] = useState<Artwork | undefined>(undefined);
  useEffect(() => {
    if (!run) return;
    getArtworkById(run.candidateArtworkId).then(setCandidateArtwork);
    if (run.versionComparison) {
      getArtworkById(run.versionComparison.approvedArtworkId).then(setApprovedArtwork);
    } else {
      setApprovedArtwork(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);
  const summary = run?.versionComparison ? summarizeFields(run.versionComparison.result.comparison.fields) : null;

  if (!run) {
    return (
      <Box>
        <Button startIcon={<MdArrowBack />} sx={{ textTransform: 'none', mb: 2 }} component={RouterLink} to="/comparison">
          Back to Label Comparison
        </Button>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ color: '#6B7177', fontWeight: 700 }}>
            Comparison not found
          </Typography>
          <Typography variant="body2" sx={{ color: '#9EA4AB', mt: 0.5 }}>
            This comparison may have been removed, or the link is incorrect.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const handleDownloadReport = () => {
    generateComparisonPDF(run);
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
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Product
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {run.productName}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Party
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {run.marketingCompany}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Comparison ID
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {run.id}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Status
                </Typography>
                <StatusChip status="Completed" />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                  Compared On
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                  {formatDateTime(run.comparisonDate)}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Button variant="outlined" startIcon={<MdFileDownload />} sx={{ textTransform: 'none' }} onClick={handleDownloadReport}>
            Download Report
          </Button>
        </Box>
      </Paper>

      {versionComparison ? (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Typography variant="overline" sx={{ color: '#9EA4AB', letterSpacing: 1 }}>
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
              <Typography variant="overline" sx={{ color: '#9EA4AB', letterSpacing: 1 }}>
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
              <Typography variant="overline" sx={{ color: '#9EA4AB', letterSpacing: 1.2 }}>
                Overall Match
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, color: '#E26737' }}>
                {versionComparison.result.comparison.overallPercentage}%
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
              {SUMMARY_METRICS.map((metric) => (
                <Box key={metric.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, border: '1px solid #D8DDE3', borderRadius: 2, p: 1.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: metric.color, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                      {metric.label}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#2E3135' }}>
                      {summary![metric.key]}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>

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
                  <Box component="tr" sx={{ bgcolor: '#F3F7FA' }}>
                    {['Parameter', 'Label Artwork', 'Latest Approved', 'Status'].map((heading) => (
                      <Box component="th" key={heading} sx={{ textAlign: 'left', p: 1.5, fontWeight: 700, fontSize: 14, borderBottom: '1px solid #D8DDE3' }}>
                        {heading}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {versionComparison.result.comparison.fields.map((field) => (
                    <Box component="tr" key={field.field} sx={{ '&:hover': { bgcolor: '#EEF1F4' } }}>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid #D8DDE3', fontWeight: 600, fontSize: 14 }}>
                        {field.label}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid #D8DDE3', fontSize: 14 }}>
                        {field.labelA || '—'}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid #D8DDE3', fontSize: 14 }}>
                        {field.labelB || '—'}
                      </Box>
                      <Box component="td" sx={{ p: 1.5, borderBottom: '1px solid #D8DDE3' }}>
                        <StatusChip status={classifyDeviation(field)} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#9EA4AB', fontStyle: 'italic' }}>
              Compared against Latest Approved — {formatVersionLabel(versionComparison.approvedArtworkVersion)}
            </Typography>
          </Paper>
        </>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, borderRadius: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Version Comparison
          </Typography>
          <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
            No previous approved version was found for this label ({run.candidateArtworkFileName},{' '}
            {formatVersionLabel(run.candidateArtworkVersion)}) — version comparison has been skipped. Proceeding directly to
            Cross-Company Comparison below.
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Cross-Company Comparison
        </Typography>
        <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 2 }}>
          {run.productName} ({run.marketingCompany}) compared against similar labels belonging to other marketing companies.
        </Typography>
        <CrossCompanyResults results={run.crossCompanyResults} />
      </Paper>
    </Box>
  );
}
