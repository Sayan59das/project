// "Deviations" review list — the redesign's key UX improvement over forcing
// the user to scan a full comparison table: every non-matching field is
// surfaced as a numbered, expandable review item instead. Clicking an item
// reveals its New vs. Latest Approved values (a real, honest "details"
// action); it deliberately does NOT claim to focus/highlight a location on
// the artwork preview, since the extraction pipeline has no coordinate data
// to back that up — faking it would be exactly the kind of invented
// functionality this redesign must avoid.
import { useState } from 'react';
import { Box, Collapse, IconButton, Paper, Typography } from '@mui/material';
import { MdExpandLess, MdExpandMore } from 'react-icons/md';
import { StatusChip } from '../StatusChip';
import type { LabelComparisonFieldResult } from '../../types/labelComparison';

export type DeviationStatus = 'MODIFIED' | 'CONFLICTING' | 'MISSING' | 'NOT_COMPARED';

// A DIFFERENT field is split into MODIFIED vs. CONFLICTING using the
// backend's own per-field `importance` (HIGH/MEDIUM/LOW) — a real signal
// already returned by the comparison API, not an invented distinction.
export function classifyDeviation(field: LabelComparisonFieldResult): DeviationStatus | 'MATCH' {
  if (field.status === 'MATCH') return 'MATCH';
  if (field.status === 'MISSING') return 'MISSING';
  if (field.status === 'NOT_COMPARED') return 'NOT_COMPARED';
  return field.importance === 'HIGH' ? 'CONFLICTING' : 'MODIFIED';
}

type Props = {
  fields: LabelComparisonFieldResult[];
  newLabel: string;
  approvedLabel: string;
};

export function DeviationsPanel({ fields, newLabel, approvedLabel }: Props) {
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const deviations = fields.map((field) => ({ field, status: classifyDeviation(field) })).filter((item) => item.status !== 'MATCH');

  if (deviations.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
          No deviations found — every compared field matches the latest approved artwork.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {deviations.map((item, index) => {
        const isOpen = expandedField === item.field.field;
        return (
          <Paper key={item.field.field} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, cursor: 'pointer' }}
              onClick={() => setExpandedField(isOpen ? null : item.field.field)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#9EA4AB', minWidth: 24 }}>
                  {String(index + 1).padStart(2, '0')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#2E3135' }}>
                  {item.field.label}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <StatusChip status={item.status} />
                <IconButton size="small">{isOpen ? <MdExpandLess /> : <MdExpandMore />}</IconButton>
              </Box>
            </Box>
            <Collapse in={isOpen}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, px: 2, pb: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                    {newLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                    {item.field.labelA || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block' }}>
                    {approvedLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#2E3135' }}>
                    {item.field.labelB || '—'}
                  </Typography>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        );
      })}
    </Box>
  );
}
