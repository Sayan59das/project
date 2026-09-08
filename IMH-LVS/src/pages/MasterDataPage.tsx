/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { MdClose } from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useAuth } from '../auth/AuthContext';
import { MASTER_TYPES, MasterTypeKey, MasterStatus } from '../types/masters';
import { formatDateTime } from '../utils/dateFormat';
import {
  createMarketingCompany,
  updateMarketingCompany,
  deactivateMarketingCompany,
  findDuplicateMarketingCompany,
  createManufacturingCompany,
  updateManufacturingCompany,
  deactivateManufacturingCompany,
  findDuplicateManufacturingCompany,
  createBrand,
  updateBrand,
  deactivateBrand,
  findDuplicateBrand,
  createFlavour,
  updateFlavour,
  deactivateFlavour,
  findDuplicateFlavour,
  createClaim,
  updateClaim,
  deactivateClaim,
  findDuplicateClaim,
  createProductCategory,
  updateProductCategory,
  deactivateProductCategory,
  findDuplicateProductCategory
} from '../services/masterService';
import { useInvalidateMaster, useMarketingCompanies, useMasterType } from '../hooks/useMasterData';

const ALL = 'All';

// Any record from any of the six master collections â€” this page treats them
// generically by field name, which is safe because each branch below only
// ever reads/writes the fields that type actually has.
type MasterRecord = Record<string, any>;

type Column = { header: string; render: (item: MasterRecord) => React.ReactNode };

function getColumns(type: MasterTypeKey): Column[] {
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      return [
        { header: 'ID', render: (item) => item.id },
        { header: 'Company Name', render: (item) => item.companyName },
        { header: 'Short Code', render: (item) => item.shortCode }
      ];
    case 'brands':
      return [
        { header: 'ID', render: (item) => item.id },
        { header: 'Brand Name', render: (item) => item.brandName },
        { header: 'Party', render: (item) => item.marketingCompany }
      ];
    case 'flavours':
      return [
        { header: 'ID', render: (item) => item.id },
        { header: 'Flavour Name', render: (item) => item.flavourName }
      ];
    case 'claims':
      return [
        { header: 'ID', render: (item) => item.id },
        { header: 'Claim Text', render: (item) => item.claimText },
        { header: 'Description', render: (item) => item.description }
      ];
    case 'productCategories':
      return [
        { header: 'ID', render: (item) => item.id },
        { header: 'Category Name', render: (item) => item.categoryName },
        { header: 'Description', render: (item) => item.description }
      ];
  }
}

function getSearchableText(type: MasterTypeKey, item: MasterRecord): string[] {
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      return [item.companyName, item.shortCode];
    case 'brands':
      return [item.brandName, item.marketingCompany];
    case 'flavours':
      return [item.flavourName];
    case 'claims':
      return [item.claimText, item.description];
    case 'productCategories':
      return [item.categoryName, item.description];
  }
}

function getPrimaryLabel(type: MasterTypeKey, item: MasterRecord): string {
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      return item.companyName;
    case 'brands':
      return item.brandName;
    case 'flavours':
      return item.flavourName;
    case 'claims':
      return item.claimText;
    case 'productCategories':
      return item.categoryName;
  }
}

// The list passed in is the one this tab is already displaying, so the warning
// matches what the user can see. The database still owns the real UNIQUE
// constraints and reports a conflict naming the record; persist() surfaces it.
function findDuplicate(type: MasterTypeKey, items: any[], form: MasterRecord, excludeId?: string): MasterRecord | undefined {
  switch (type) {
    case 'marketingCompanies':
      return findDuplicateMarketingCompany(items, form.companyName, excludeId);
    case 'manufacturingCompanies':
      return findDuplicateManufacturingCompany(items, form.companyName, excludeId);
    case 'brands':
      return findDuplicateBrand(items, form.brandName, form.marketingCompany, excludeId);
    case 'flavours':
      return findDuplicateFlavour(items, form.flavourName, excludeId);
    case 'claims':
      return findDuplicateClaim(items, form.claimText, excludeId);
    case 'productCategories':
      return findDuplicateProductCategory(items, form.categoryName, excludeId);
  }
}

// None of these three take an actor any more: the server reads it from the
// session cookie, so the name the page used to send was already ignored.
function persistCreate(type: MasterTypeKey, form: MasterRecord): Promise<MasterRecord> {
  switch (type) {
    case 'marketingCompanies':
      return createMarketingCompany(form as any);
    case 'manufacturingCompanies':
      return createManufacturingCompany(form as any);
    case 'brands':
      return createBrand(form as any);
    case 'flavours':
      return createFlavour(form as any);
    case 'claims':
      return createClaim(form as any);
    case 'productCategories':
      return createProductCategory(form as any);
  }
}

function persistUpdate(type: MasterTypeKey, id: string, form: MasterRecord): Promise<MasterRecord | undefined> {
  switch (type) {
    case 'marketingCompanies':
      return updateMarketingCompany(id, form as any);
    case 'manufacturingCompanies':
      return updateManufacturingCompany(id, form as any);
    case 'brands':
      return updateBrand(id, form as any);
    case 'flavours':
      return updateFlavour(id, form as any);
    case 'claims':
      return updateClaim(id, form as any);
    case 'productCategories':
      return updateProductCategory(id, form as any);
  }
}

function persistDeactivate(type: MasterTypeKey, id: string): Promise<MasterRecord | undefined> {
  switch (type) {
    case 'marketingCompanies':
      return deactivateMarketingCompany(id);
    case 'manufacturingCompanies':
      return deactivateManufacturingCompany(id);
    case 'brands':
      return deactivateBrand(id);
    case 'flavours':
      return deactivateFlavour(id);
    case 'claims':
      return deactivateClaim(id);
    case 'productCategories':
      return deactivateProductCategory(id);
  }
}

function emptyForm(type: MasterTypeKey): MasterRecord {
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      return { companyName: '', shortCode: '', status: 'Active' as MasterStatus };
    case 'brands':
      return { brandName: '', marketingCompany: '', status: 'Active' as MasterStatus };
    case 'flavours':
      return { flavourName: '', status: 'Active' as MasterStatus };
    case 'claims':
      return { claimText: '', description: '', status: 'Active' as MasterStatus };
    case 'productCategories':
      return { categoryName: '', description: '', status: 'Active' as MasterStatus };
  }
}

function toFormState(type: MasterTypeKey, item: MasterRecord): MasterRecord {
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      return { companyName: item.companyName, shortCode: item.shortCode, status: item.status };
    case 'brands':
      return { brandName: item.brandName, marketingCompany: item.marketingCompany, status: item.status };
    case 'flavours':
      return { flavourName: item.flavourName, status: item.status };
    case 'claims':
      return { claimText: item.claimText, description: item.description, status: item.status };
    case 'productCategories':
      return { categoryName: item.categoryName, description: item.description, status: item.status };
  }
}

function validate(type: MasterTypeKey, form: MasterRecord): Record<string, string> {
  const errors: Record<string, string> = {};
  switch (type) {
    case 'marketingCompanies':
    case 'manufacturingCompanies':
      if (!form.companyName.trim()) errors.companyName = 'Company Name is required.';
      break;
    case 'brands':
      if (!form.brandName.trim()) errors.brandName = 'Brand Name is required.';
      if (!form.marketingCompany) errors.marketingCompany = 'Party is required.';
      break;
    case 'flavours':
      if (!form.flavourName.trim()) errors.flavourName = 'Flavour Name is required.';
      break;
    case 'claims':
      if (!form.claimText.trim()) errors.claimText = 'Claim Text is required.';
      break;
    case 'productCategories':
      if (!form.categoryName.trim()) errors.categoryName = 'Category Name is required.';
      break;
  }
  return errors;
}

export function MasterDataPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('MANAGE_MASTERS');

  const [activeType, setActiveType] = useState<MasterTypeKey>('marketingCompanies');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | MasterStatus>('All');

  // The active tab's rows, and the Parties list the Brand form needs. Both are
  // cached per master type, so switching tabs and coming back does not refetch,
  // and a save invalidates only the type that was written.
  const { items, isLoading, isError, error: loadError } = useMasterType(activeType);
  const marketingCompanies = useMarketingCompanies();
  const invalidateMaster = useInvalidateMaster();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<MasterRecord>(() => emptyForm('marketingCompanies'));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [duplicateMatch, setDuplicateMatch] = useState<MasterRecord | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewItem, setViewItem] = useState<MasterRecord | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<MasterRecord | null>(null);

  const activeConfig = MASTER_TYPES.find((type) => type.key === activeType)!;
  const columns = useMemo(() => getColumns(activeType), [activeType]);

  const allItems = items as MasterRecord[];

  const activeMarketingCompanyOptions = useMemo(() => {
    const active = marketingCompanies.items
      .filter((company) => company.status === 'Active')
      .map((company) => company.companyName);
    // A brand already pointing at a since-deactivated party keeps that party as
    // an option while it is being edited, so opening the form does not silently
    // reassign the brand to whichever company happens to sort first.
    if (formState.marketingCompany && !active.includes(formState.marketingCompany)) {
      return [...active, formState.marketingCompany];
    }
    return active;
  }, [marketingCompanies.items, formState.marketingCompany]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter((item) => {
      const matchesSearch = !term || getSearchableText(activeType, item).some((value) => (value ?? '').toLowerCase().includes(term));
      const matchesStatus = statusFilter === ALL || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allItems, activeType, search, statusFilter]);

  // Four different empty tables that used to read as one: still loading, the
  // fetch failed, a search that matches nothing, and a genuinely empty master.
  // Only the last two are about the data.
  const emptyMessage = isLoading
    ? 'Loading…'
    : isError
      ? 'Could not load this master data.'
      : allItems.length > 0 && search.trim() !== ''
        ? 'No records match your search.'
        : 'No records found.';

  const handleSwitchType = (type: MasterTypeKey) => {
    setActiveType(type);
    setSearch('');
    setStatusFilter(ALL);
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormState(emptyForm(activeType));
    setFormErrors({});
    setFormOpen(true);
  };

  const handleOpenEdit = (item: MasterRecord) => {
    setEditingId(item.id);
    setFormState(toFormState(activeType, item));
    setFormErrors({});
    setViewOpen(false);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setDuplicateMatch(null);
  };

  const persist = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      if (editingId) {
        await persistUpdate(activeType, editingId, formState);
      } else {
        await persistCreate(activeType, formState);
      }
      invalidateMaster(activeType);
      // A new party is also a new option in the Brand form's dropdown.
      if (activeType === 'marketingCompanies') invalidateMaster('marketingCompanies');
      setFormOpen(false);
      setDuplicateMatch(null);
    } catch (error) {
      // The form stays open with what was typed. The backend's message names
      // the record — 'A brand named "VitaFit" already exists.' — which is the
      // half of a duplicate the client-side check can miss, because it only
      // sees the rows this browser has loaded.
      setSaveError(error instanceof Error ? error.message : 'Could not save this record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    const errors = validate(activeType, formState);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (!editingId) {
      const duplicate = findDuplicate(activeType, allItems, formState);
      if (duplicate) {
        setDuplicateMatch(duplicate);
        return;
      }
    }
    void persist();
  };

  const handleOpenView = (item: MasterRecord) => {
    setViewItem(item);
    setViewOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    setDeactivateTarget(null);
    try {
      await persistDeactivate(activeType, target.id);
      invalidateMaster(activeType);
      setViewItem((prev) => (prev && prev.id === target.id ? { ...prev, status: 'Inactive' } : prev));
    } catch (error) {
      // Nothing changed, so the row must not be shown as Inactive: the details
      // panel is left exactly as it was and the failure is reported.
      setSaveError(error instanceof Error ? error.message : 'Could not deactivate this record.');
    }
  };

  return (
    <Box>
      <PageHeader title="Masters" subtitle="Manage standard reference data used across the Label Verification System." />

      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {MASTER_TYPES.map((type) => (
            <Button
              key={type.key}
              variant={activeType === type.key ? 'contained' : 'text'}
              color={activeType === type.key ? 'primary' : 'inherit'}
              onClick={() => handleSwitchType(type.key)}
              sx={{ textTransform: 'none', borderRadius: 2, minWidth: 144 }}
            >
              {type.label}
            </Button>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {activeConfig.label}
          </Typography>
          {canManage && (
            <Button variant="contained" sx={{ bgcolor: 'var(--c-orange)', '&:hover': { bgcolor: 'var(--c-orange-600)' } }} onClick={handleOpenAdd}>
              + Add {activeConfig.addLabel}
            </Button>
          )}
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
          <TextField
            fullWidth
            placeholder={`Search ${activeConfig.label.toLowerCase()}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(event: SelectChangeEvent) => setStatusFilter(event.target.value as any)}>
              <MenuItem value={ALL}>All</MenuItem>
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* A failed fetch is reported as a failure, with the server's own
            sentence. An empty table under a silent error is how somebody
            concludes the brand they are looking for does not exist. */}
        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError instanceof Error ? loadError.message : 'Could not load this master data.'}
          </Alert>
        )}

        {filteredItems.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: 'var(--c-text-3)' }}>
              {emptyMessage}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell key={column.header} sx={{ fontWeight: 700 }}>
                      {column.header}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: 'var(--c-surface)' } }}>
                    {columns.map((column) => (
                      <TableCell key={column.header}>{column.render(item)}</TableCell>
                    ))}
                    <TableCell>
                      <StatusChip status={item.status} />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Button variant="text" size="small" sx={{ textTransform: 'none' }} onClick={() => handleOpenView(item)}>
                          View
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="text" size="small" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(item)}>
                              Edit
                            </Button>
                            <Button
                              variant="text"
                              size="small"
                              color={item.status === 'Active' ? 'error' : 'success'}
                              sx={{ textTransform: 'none' }}
                              onClick={() => setDeactivateTarget(item)}
                              disabled={item.status !== 'Active'}
                            >
                              Deactivate
                            </Button>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Add / Edit */}
      <Drawer anchor="right" open={formOpen} onClose={handleCloseForm}>
        <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {editingId ? `Edit ${activeConfig.addLabel}` : `Add ${activeConfig.addLabel}`}
            </Typography>
            <IconButton onClick={handleCloseForm}>
              <MdClose />
            </IconButton>
          </Box>

          <Stack spacing={2}>
            {(activeType === 'marketingCompanies' || activeType === 'manufacturingCompanies') && (
              <>
                <TextField
                  label="Company Name *"
                  value={formState.companyName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, companyName: event.target.value }))}
                  error={Boolean(formErrors.companyName)}
                  helperText={formErrors.companyName}
                />
                <TextField
                  label="Short Name / Code"
                  value={formState.shortCode}
                  onChange={(event) => setFormState((prev) => ({ ...prev, shortCode: event.target.value }))}
                />
              </>
            )}

            {activeType === 'brands' && (
              <>
                <TextField
                  label="Brand Name *"
                  value={formState.brandName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, brandName: event.target.value }))}
                  error={Boolean(formErrors.brandName)}
                  helperText={formErrors.brandName || 'Stored exactly as typed â€” casing is not auto-changed.'}
                />
                <FormControl error={Boolean(formErrors.marketingCompany)}>
                  <InputLabel>Party *</InputLabel>
                  <Select
                    value={formState.marketingCompany}
                    label="Party *"
                    onChange={(event: SelectChangeEvent) => setFormState((prev) => ({ ...prev, marketingCompany: event.target.value }))}
                  >
                    {activeMarketingCompanyOptions.map((company) => (
                      <MenuItem key={company} value={company}>
                        {company}
                      </MenuItem>
                    ))}
                  </Select>
                  {formErrors.marketingCompany && <FormHelperText>{formErrors.marketingCompany}</FormHelperText>}
                </FormControl>
              </>
            )}

            {activeType === 'flavours' && (
              <TextField
                label="Flavour Name *"
                value={formState.flavourName}
                onChange={(event) => setFormState((prev) => ({ ...prev, flavourName: event.target.value }))}
                error={Boolean(formErrors.flavourName)}
                helperText={formErrors.flavourName}
              />
            )}

            {activeType === 'claims' && (
              <>
                <TextField
                  label="Claim Name / Text *"
                  value={formState.claimText}
                  onChange={(event) => setFormState((prev) => ({ ...prev, claimText: event.target.value }))}
                  error={Boolean(formErrors.claimText)}
                  helperText={formErrors.claimText}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={2}
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                />
              </>
            )}

            {activeType === 'productCategories' && (
              <>
                <TextField
                  label="Category Name *"
                  value={formState.categoryName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, categoryName: event.target.value }))}
                  error={Boolean(formErrors.categoryName)}
                  helperText={formErrors.categoryName}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={2}
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                />
              </>
            )}

            <FormControl>
              <InputLabel>Status</InputLabel>
              <Select
                value={formState.status}
                label="Status"
                onChange={(event: SelectChangeEvent) => setFormState((prev) => ({ ...prev, status: event.target.value }))}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {saveError && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {saveError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
            <Button onClick={handleCloseForm} sx={{ textTransform: 'none' }} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Save'}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Duplicate warning */}
      <Dialog open={Boolean(duplicateMatch)} onClose={() => setDuplicateMatch(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Similar master record already exists</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: 2 }}>
            An active {activeConfig.addLabel.toLowerCase()} with this information already exists:
          </Typography>
          {duplicateMatch && (
            <Paper sx={{ p: 2, bgcolor: 'var(--c-surface)' }}>
              <Typography variant="body2">
                <strong>{getPrimaryLabel(activeType, duplicateMatch)}</strong> ({duplicateMatch.id})
              </Typography>
              {activeType === 'brands' && <Typography variant="body2">Party: {duplicateMatch.marketingCompany}</Typography>}
              <Typography variant="body2">Status: {duplicateMatch.status}</Typography>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDuplicateMatch(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" sx={{ textTransform: 'none' }} onClick={persist}>
            Continue Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Deactivate {activeConfig.addLabel}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
            Are you sure you want to deactivate this {activeConfig.addLabel.toLowerCase()}?
          </Typography>
          {deactivateTarget && (
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>
              {getPrimaryLabel(activeType, deactivateTarget)} ({deactivateTarget.id})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeactivateTarget(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={handleConfirmDeactivate}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {/* View */}
      <Drawer anchor="right" open={viewOpen} onClose={() => setViewOpen(false)}>
        <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {activeConfig.addLabel} Details
            </Typography>
            <IconButton onClick={() => setViewOpen(false)}>
              <MdClose />
            </IconButton>
          </Box>

          {viewItem && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Paper sx={{ p: 3, borderRadius: 3, bgcolor: 'var(--c-surface)' }}>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1 }}>
                  {viewItem.id}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  {getPrimaryLabel(activeType, viewItem)}
                </Typography>
                <StatusChip status={viewItem.status} />
              </Paper>

              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1, fontWeight: 700 }}>
                  Details
                </Typography>
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  {columns
                    .filter((column) => column.header !== 'ID')
                    .map((column) => (
                      <Typography key={column.header} variant="body2">
                        {column.header}: {column.render(viewItem)}
                      </Typography>
                    ))}
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography variant="subtitle2" sx={{ color: 'var(--c-text-2)', mb: 1, fontWeight: 700 }}>
                  Audit Information
                </Typography>
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  <Typography variant="body2">
                    Created: {formatDateTime(viewItem.createdDate)} by {viewItem.createdBy}
                  </Typography>
                  <Typography variant="body2">
                    Updated: {formatDateTime(viewItem.updatedDate)} by {viewItem.updatedBy}
                  </Typography>
                </Box>
              </Box>

              {canManage && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(viewItem)}>
                    Edit
                  </Button>
                  {viewItem.status === 'Active' && (
                    <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={() => setDeactivateTarget(viewItem)}>
                      Deactivate
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
