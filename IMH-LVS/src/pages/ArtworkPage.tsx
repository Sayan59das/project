import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormHelperText,
  IconButton,
  InputBase,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import {
  MdBookmark,
  MdBusiness,
  MdCalendarToday,
  MdCategory,
  MdClose,
  MdCloseFullscreen,
  MdComment,
  MdConfirmationNumber,
  MdDescription,
  MdEdit,
  MdHistory,
  MdInsertDriveFile,
  MdInventory2,
  MdOpenInFull,
  MdOutlineArchive,
  MdOutlineFileDownload,
  MdPerson,
  MdRemoveRedEye,
  MdSearch,
  MdStorage,
  MdUploadFile
} from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { ArtworkPreview } from '../components/ArtworkPreview';
import { useAuth } from '../auth/AuthContext';
import { getBrands, getFlavours, getMarketingCompanies } from '../services/masterService';
import { getSettings } from '../services/settingsService';
import { extractLabelData, LabelExtractionError } from '../services/extractionService';
import {
  findExactProductMatch,
  findPossibleProductMatches,
  LabelIntakeExtractedFields,
  LabelIntakeResult,
  submitLabelIntake
} from '../services/labelIntakeService';
import {
  archiveArtwork,
  findDuplicateArtworkVersion,
  getArtworks,
  sendArtworkForComparison,
  suggestNextArtworkVersion,
  updateArtwork
} from '../services/artworkService';
import {
  ARTWORK_STATUS_OPTIONS,
  ARTWORK_TYPE_OPTIONS,
  Artwork,
  ArtworkInput,
  ArtworkType,
  MAX_ARTWORK_FILE_SIZE_BYTES,
  SUPPORTED_ARTWORK_FILE_TYPES
} from '../types/artwork';
import { formatDateTime } from '../utils/dateFormat';

const ALL = 'All';

type FilterState = {
  version: string;
  fileType: string;
  artworkType: string;
  uploadedBy: string;
  status: string;
  uploadDateFrom: string;
  uploadDateTo: string;
};

const EMPTY_FILTERS: FilterState = {
  version: ALL,
  fileType: ALL,
  artworkType: ALL,
  uploadedBy: ALL,
  status: ALL,
  uploadDateFrom: '',
  uploadDateTo: ''
};

// The three top-of-table views requested alongside the filter box — a
// coarser, always-visible grouping by status than the Status filter
// dropdown (which still narrows further within whichever tab is active).
// 'Active' is everything not in the other two: any artwork mid-workflow
// (Pending Comparison, Under Review, Approved, Final Approved, Revision
// Required, Rejected) is still "active" work, not a draft and not shelved.
type ArtworkTab = 'Active' | 'Draft' | 'Archive';
const ARTWORK_TABS: ArtworkTab[] = ['Active', 'Draft', 'Archive'];

function matchesArtworkTab(status: Artwork['status'], tab: ArtworkTab): boolean {
  if (tab === 'Draft') return status === 'Draft';
  if (tab === 'Archive') return status === 'Archived';
  return status !== 'Draft' && status !== 'Archived';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

// The stored fileType is the raw upload MIME type (e.g. "application/pdf")
// — never shown to users as-is; this is the one place it's mapped to the
// short label used in both the File Type column and its filter dropdown.
function formatFileType(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/png') return 'PNG';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'JPG';
  return mimeType || '—';
}

function parseVersionNumber(version: string): number {
  const match = /(\d+)/.exec(version);
  return match ? Number(match[1]) : 0;
}

function emptyForm(): ArtworkInput {
  return {
    productId: '',
    productName: '',
    brand: '',
    marketingCompany: '',
    manufacturingCompany: '',
    version: '',
    artworkType: 'Full Label',
    fileName: '',
    fileType: '',
    fileSize: 0,
    filePath: '',
    status: 'Draft',
    remarks: ''
  };
}

function emptyLabelForm(): LabelIntakeExtractedFields {
  return {
    productName: '',
    marketingCompanyName: '',
    address: '',
    fssaiNumber: '',
    email: '',
    customerCareNumber: '',
    brand: '',
    flavour: '',
    packageSize: ''
  };
}

function fieldStatus(value: string): 'Verified' | 'Pending' {
  return value.trim() ? 'Verified' : 'Pending';
}

type FormErrors = Partial<Record<'artworkType', string>>;

type UploadErrors = Partial<
  Record<
    | 'file'
    | 'productName'
    | 'marketingCompanyName'
    | 'brand'
    | 'flavour'
    | 'packageSize'
    | 'fssaiNumber'
    | 'email'
    | 'customerCareNumber'
    | 'address'
    | 'linkChoice'
    | 'submit',
    string
  >
>;

const NEW_PRODUCT_CHOICE = '__new__';

export function ArtworkPage() {
  const { currentUser, hasPermission } = useAuth();
  const canUpload = hasPermission('UPLOAD');
  const canEdit = hasPermission('EDIT');
  const canSendForComparison = hasPermission('INITIATE');
  const actor = currentUser?.fullName ?? 'Unknown User';
  const actorInfo = {
    id: currentUser?.id ?? '',
    name: currentUser?.fullName ?? 'Unknown User',
    role: currentUser?.role ?? 'account_manager'
  };
  const defaultPageSize = getSettings(currentUser?.id ?? '').pageSize;

  const [artworks, setArtworks] = useState<Artwork[]>(() => getArtworks());
  const [search, setSearch] = useState('');
  const [filterDraft, setFilterDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [statusTab, setStatusTab] = useState<ArtworkTab>('Active');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ArtworkInput>(emptyForm());
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<Artwork | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------
  // Label upload / extraction / verification (new artwork creation only —
  // this is now the sole way a Product record gets created, see
  // labelIntakeService.ts). Editing an existing artwork's own metadata
  // (below) is unrelated and unchanged.
  // ---------------------------------------------------------------------
  const [labelForm, setLabelForm] = useState<LabelIntakeExtractedFields>(emptyLabelForm());
  const [uploadArtworkType, setUploadArtworkType] = useState<ArtworkType>('Full Label');
  const [uploadVersion, setUploadVersion] = useState('');
  const [versionTouched, setVersionTouched] = useState(false);
  const [uploadRemarks, setUploadRemarks] = useState('');
  const [filePath, setFilePath] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [linkToProductId, setLinkToProductId] = useState('');
  const [uploadErrors, setUploadErrors] = useState<UploadErrors>({});
  const [intakeResult, setIntakeResult] = useState<LabelIntakeResult | null>(null);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewArtwork, setViewArtwork] = useState<Artwork | null>(null);
  const [viewFullscreen, setViewFullscreen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Artwork | null>(null);

  const refresh = () => setArtworks(getArtworks());

  const marketingCompanyOptions = useMemo(() => getMarketingCompanies().map((company) => company.companyName), []);
  const brandOptions = useMemo(() => {
    const all = getBrands();
    const scoped = labelForm.marketingCompanyName
      ? all.filter((brand) => brand.marketingCompany.trim().toLowerCase() === labelForm.marketingCompanyName.trim().toLowerCase())
      : all;
    return Array.from(new Set(scoped.map((brand) => brand.brandName)));
  }, [labelForm.marketingCompanyName]);
  const flavourOptions = useMemo(() => getFlavours().map((flavour) => flavour.flavourName), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exactProductMatch = useMemo(() => findExactProductMatch(labelForm), [labelForm.productName, labelForm.brand, labelForm.marketingCompanyName]);
  const possibleMatches = useMemo(
    () => (exactProductMatch ? [] : findPossibleProductMatches(labelForm)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelForm.brand, labelForm.marketingCompanyName, exactProductMatch]
  );

  // Reset an in-progress "which product?" choice whenever the identifying
  // fields change enough that the previous candidate list no longer applies.
  useEffect(() => {
    setLinkToProductId('');
  }, [labelForm.brand, labelForm.marketingCompanyName]);

  const resolvedLinkProductId =
    linkToProductId && linkToProductId !== NEW_PRODUCT_CHOICE ? linkToProductId : undefined;
  const targetProductId = exactProductMatch?.id ?? resolvedLinkProductId;

  // Auto-suggest the next version once the product/company/type this
  // artwork belongs to is known, unless the user has manually overridden it.
  useEffect(() => {
    if (versionTouched || !selectedFile) return;
    if (targetProductId && labelForm.marketingCompanyName) {
      setUploadVersion(suggestNextArtworkVersion(targetProductId, labelForm.marketingCompanyName, uploadArtworkType));
    } else {
      setUploadVersion('V1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProductId, labelForm.marketingCompanyName, uploadArtworkType, versionTouched, selectedFile]);

  // ---------------------------------------------------------------------
  // Filter option lists (derived from actual artwork data, so filters
  // always reflect what's really in the table — active or historical).
  // Kept in step with the table's own column set: one option list per
  // filterable column (File Name and Actions aren't list-filterable).
  // ---------------------------------------------------------------------
  const versionFilterOptions = useMemo(() => Array.from(new Set(artworks.map((a) => a.version))).sort(), [artworks]);
  const fileTypeFilterOptions = useMemo(() => Array.from(new Set(artworks.map((a) => a.fileType))).sort(), [artworks]);
  const uploadedByFilterOptions = useMemo(() => Array.from(new Set(artworks.map((a) => a.uploadedBy))).sort(), [artworks]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return artworks.filter((artwork) => {
      const matchesTab = matchesArtworkTab(artwork.status, statusTab);

      const matchesSearch =
        !term ||
        [artwork.id, artwork.productName, artwork.productId, artwork.brand, artwork.marketingCompany, artwork.version, artwork.fileName].some(
          (value) => value.toLowerCase().includes(term)
        );

      const matchesType = appliedFilters.artworkType === ALL || artwork.artworkType === appliedFilters.artworkType;
      const matchesVersion = appliedFilters.version === ALL || artwork.version === appliedFilters.version;
      const matchesFileType = appliedFilters.fileType === ALL || artwork.fileType === appliedFilters.fileType;
      const matchesStatus = appliedFilters.status === ALL || artwork.status === appliedFilters.status;
      const matchesUploadedBy = appliedFilters.uploadedBy === ALL || artwork.uploadedBy === appliedFilters.uploadedBy;
      // uploadDate is stored as an ISO "YYYY-MM-DD" string, same shape a
      // native date input produces, so a plain string comparison already
      // orders correctly without parsing either side into a Date.
      const matchesUploadDateFrom = !appliedFilters.uploadDateFrom || artwork.uploadDate >= appliedFilters.uploadDateFrom;
      const matchesUploadDateTo = !appliedFilters.uploadDateTo || artwork.uploadDate <= appliedFilters.uploadDateTo;

      return (
        matchesTab &&
        matchesSearch &&
        matchesType &&
        matchesVersion &&
        matchesFileType &&
        matchesStatus &&
        matchesUploadedBy &&
        matchesUploadDateFrom &&
        matchesUploadDateTo
      );
    });
  }, [artworks, search, appliedFilters, statusTab]);

  const filtersActive = Object.entries(appliedFilters).some(([key, value]) =>
    key === 'uploadDateFrom' || key === 'uploadDateTo' ? value !== '' : value !== ALL
  );
  const emptyMessage =
    artworks.length === 0
      ? 'No artwork has been uploaded yet.'
      : search.trim() !== ''
      ? 'No artwork matches your search.'
      : filtersActive
      ? 'No artwork matches the selected filters.'
      : 'No artwork has been uploaded yet.';

  const stats = useMemo(
    () => ({
      total: artworks.length,
      draft: artworks.filter((a) => a.status === 'Draft').length,
      pendingComparison: artworks.filter((a) => a.status === 'Pending Comparison').length,
      approved: artworks.filter((a) => a.status === 'Approved' || a.status === 'Final Approved').length,
      archived: artworks.filter((a) => a.status === 'Archived').length
    }),
    [artworks]
  );

  const handleApplyFilters = () => setAppliedFilters(filterDraft);
  const handleClearFilters = () => {
    setFilterDraft(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  // ---------------------------------------------------------------------
  // Upload / Edit
  // ---------------------------------------------------------------------
  const handleOpenUpload = () => {
    setEditingId(null);
    setFormState(emptyForm());
    setFormErrors({});
    setSelectedFile(null);
    setFilePath('');
    setLabelForm(emptyLabelForm());
    setExtractionError(null);
    setUploadArtworkType('Full Label');
    setUploadVersion('');
    setVersionTouched(false);
    setUploadRemarks('');
    setLinkToProductId('');
    setUploadErrors({});
    setFormOpen(true);
  };

  const handleOpenEdit = (artwork: Artwork) => {
    setEditingId(artwork.id);
    setFormState({
      productId: artwork.productId,
      productName: artwork.productName,
      brand: artwork.brand,
      marketingCompany: artwork.marketingCompany,
      manufacturingCompany: artwork.manufacturingCompany,
      version: artwork.version,
      artworkType: artwork.artworkType,
      fileName: artwork.fileName,
      fileType: artwork.fileType,
      fileSize: artwork.fileSize,
      filePath: artwork.filePath,
      status: artwork.status,
      remarks: artwork.remarks
    });
    setFormErrors({});
    setSelectedFile(null);
    setViewOpen(false);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setDuplicateMatch(null);
  };

  const handleArtworkTypeChange = (event: SelectChangeEvent) => {
    setFormState((prev) => ({ ...prev, artworkType: event.target.value as ArtworkType }));
  };

  // Runs OCR extraction for the given file and populates labelForm from the
  // result. Never throws to its caller — a request-level failure (backend
  // unreachable, backend rejected the file, unexpected response) is caught
  // and surfaced via extractionError instead, so the user can still fill in
  // the fields by hand or retry; the already-selected file is untouched
  // either way. A successful call that simply couldn't read some/all fields
  // is not an error — those fields are left blank, per the no-fabrication
  // requirement, same as always.
  const runExtraction = async (file: File) => {
    setExtracting(true);
    setExtractionError(null);
    try {
      const extracted = await extractLabelData(file);
      setLabelForm({
        productName: extracted.productName.value,
        marketingCompanyName: extracted.marketingCompanyName.value,
        address: extracted.address.value,
        fssaiNumber: extracted.fssaiNumber.value,
        email: extracted.email.value,
        customerCareNumber: extracted.customerCareNumber.value,
        brand: extracted.brand.value,
        flavour: extracted.flavour.value,
        packageSize: extracted.packageSize.value
      });
    } catch (err) {
      setExtractionError(
        err instanceof LabelExtractionError ? err.message : 'Could not read the label automatically. Please enter the details manually.'
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleRetryExtraction = () => {
    if (selectedFile) void runExtraction(selectedFile);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!SUPPORTED_ARTWORK_FILE_TYPES.includes(file.type)) {
      setUploadErrors((prev) => ({ ...prev, file: 'Unsupported file type. Please upload a PDF, PNG or JPG file.' }));
      return;
    }
    if (file.size > MAX_ARTWORK_FILE_SIZE_BYTES) {
      setUploadErrors((prev) => ({ ...prev, file: `File is too large. Maximum size is ${formatFileSize(MAX_ARTWORK_FILE_SIZE_BYTES)}.` }));
      return;
    }

    setUploadErrors({});
    setSelectedFile(file);
    setFilePath(URL.createObjectURL(file));
    setVersionTouched(false);
    setLinkToProductId('');
    setLabelForm(emptyLabelForm());

    await runExtraction(file);
  };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!formState.artworkType) errors.artworkType = 'Artwork Type is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateUpload = (): boolean => {
    const errors: UploadErrors = {};
    if (!selectedFile) errors.file = 'A label file is required.';
    if (!labelForm.productName.trim()) errors.productName = 'Product Name could not be read from the label — please enter it.';
    if (!labelForm.marketingCompanyName.trim())
      errors.marketingCompanyName = 'Party could not be identified from the label — please enter it.';
    if (!labelForm.brand.trim()) errors.brand = 'Brand is required.';
    if (!labelForm.flavour.trim()) errors.flavour = 'Flavour is required.';
    if (!labelForm.packageSize.trim()) errors.packageSize = 'Package Size is required.';
    if (!labelForm.fssaiNumber.trim()) errors.fssaiNumber = 'FSSAI Number is required.';
    if (!labelForm.email.trim()) errors.email = 'Email is required.';
    if (!labelForm.customerCareNumber.trim()) errors.customerCareNumber = 'Customer Care Number is required.';
    if (!labelForm.address.trim()) errors.address = 'Address is required.';
    if (!exactProductMatch && possibleMatches.length > 0 && !linkToProductId) {
      errors.linkChoice = 'Multiple existing products match this Brand and Party. Select one to link, or confirm this is a new product.';
    }
    setUploadErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const persist = () => {
    if (editingId) {
      updateArtwork(editingId, { artworkType: formState.artworkType, status: formState.status, remarks: formState.remarks }, actor);
      refresh();
      setFormOpen(false);
      setDuplicateMatch(null);
      return;
    }

    if (!selectedFile) return;
    try {
      const result = submitLabelIntake(
        {
          extracted: labelForm,
          artworkType: uploadArtworkType,
          version: uploadVersion,
          remarks: uploadRemarks,
          file: { fileName: selectedFile.name, fileType: selectedFile.type, fileSize: selectedFile.size, filePath },
          linkToProductId: resolvedLinkProductId
        },
        actorInfo
      );
      refresh();
      setFormOpen(false);
      setDuplicateMatch(null);
      setIntakeResult(result);
    } catch (err) {
      setUploadErrors((prev) => ({ ...prev, submit: err instanceof Error ? err.message : 'Failed to save label information.' }));
    }
  };

  const handleSave = () => {
    if (editingId) {
      if (!validate()) return;
      persist();
      return;
    }

    if (!validateUpload()) return;
    if (targetProductId) {
      const duplicate = findDuplicateArtworkVersion(targetProductId, labelForm.marketingCompanyName, uploadVersion, uploadArtworkType);
      if (duplicate) {
        setDuplicateMatch(duplicate);
        return;
      }
    }
    persist();
  };

  // ---------------------------------------------------------------------
  // View / Archive / Send for Comparison
  // ---------------------------------------------------------------------
  const handleOpenView = (artwork: Artwork) => {
    setViewArtwork(artwork);
    setViewOpen(true);
  };

  const handleDownload = (artwork: Artwork) => {
    if (!artwork.filePath) return;
    const link = document.createElement('a');
    link.href = artwork.filePath;
    link.download = artwork.fileName || artwork.id;
    link.click();
  };

  const handleSendForComparison = (artwork: Artwork) => {
    sendArtworkForComparison(artwork.id, actorInfo);
    refresh();
    setViewArtwork((prev) => (prev && prev.id === artwork.id ? { ...prev, status: 'Pending Comparison' } : prev));
  };

  const handleConfirmArchive = () => {
    if (!archiveTarget) return;
    archiveArtwork(archiveTarget.id, actor);
    refresh();
    setViewArtwork((prev) => (prev && prev.id === archiveTarget.id ? { ...prev, status: 'Archived' } : prev));
    setArchiveTarget(null);
  };

  const versionHistory = useMemo(() => {
    if (!viewArtwork) return [];
    return getArtworks()
      .filter(
        (artwork) =>
          artwork.productId === viewArtwork.productId &&
          artwork.marketingCompany === viewArtwork.marketingCompany &&
          artwork.artworkType === viewArtwork.artworkType
      )
      .sort((a, b) => parseVersionNumber(b.version) - parseVersionNumber(a.version));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewArtwork, artworks]);

  const columns: GridColDef<Artwork>[] = [
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 160,
      flex: 1,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="View">
            <IconButton size="small" sx={{ color: '#E26737' }} onClick={() => handleOpenView(params.row)}>
              <MdRemoveRedEye size={18} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" sx={{ color: '#00A651' }} onClick={() => handleOpenEdit(params.row)}>
                <MdEdit size={18} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Download">
            <span>
              <IconButton size="small" sx={{ color: '#9EA4AB' }} disabled={!params.row.filePath} onClick={() => handleDownload(params.row)}>
                <MdOutlineFileDownload size={18} />
              </IconButton>
            </span>
          </Tooltip>
          {canEdit && params.row.status !== 'Archived' && (
            <Tooltip title="Archive">
              <IconButton size="small" color="error" onClick={() => setArchiveTarget(params.row)}>
                <MdOutlineArchive size={18} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )
    },
    { field: 'fileName', headerName: 'File Name', minWidth: 200, flex: 1.5 },
    { field: 'version', headerName: 'Version', minWidth: 90, flex: 0.6 },
    {
      field: 'fileType',
      headerName: 'File Type',
      minWidth: 110,
      flex: 0.7,
      renderCell: (params) => formatFileType(String(params.value ?? ''))
    },
    { field: 'artworkType', headerName: 'Artwork Type', minWidth: 140, flex: 1 },
    { field: 'uploadedBy', headerName: 'Added By', minWidth: 140, flex: 1 },
    { field: 'uploadDate', headerName: 'Added On', minWidth: 120, flex: 0.8, renderCell: (params) => formatDateTime(String(params.value ?? '')) },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 160,
      flex: 1,
      renderCell: (params) => <StatusChip status={String(params.value ?? '')} />
    }
  ];

  return (
    <Box>
      <PageHeader title="Artwork Management" />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', mb: 3 }}>
        {[
          { label: 'Total Artwork', value: stats.total },
          { label: 'Draft', value: stats.draft },
          { label: 'Pending Comparison', value: stats.pendingComparison },
          { label: 'Approved', value: stats.approved },
          { label: 'Archived', value: stats.archived }
        ].map((card) => (
          <Card key={card.label} sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ color: '#6B7177' }}>
                {card.label}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {card.value}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Paper
          component="form"
          onSubmit={(event) => event.preventDefault()}
          elevation={0}
          sx={{ display: 'flex', alignItems: 'center', p: '10px 14px', borderRadius: 3, bgcolor: '#F6F9F3', border: '1px solid #EAEFE7', mb: 3 }}
        >
          <MdSearch size={18} color="#9EA4AB" />
          <InputBase
            sx={{ ml: 1.5, flex: 1, fontSize: 14 }}
            placeholder="Search by Artwork ID, product, brand, company, version, or file name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Paper>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#6B7177' }}>
          Filters
        </Typography>
        {/* Order: File Type, Version, Artwork Type, Added By, Added On,
            Status — File Name and Actions aren't list-filterable (the
            search bar above already covers file name). */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControl sx={{ flex: 0.7, minWidth: 130 }}>
            <InputLabel>File Type</InputLabel>
            <Select value={filterDraft.fileType} label="File Type" onChange={(event) => setFilterDraft((prev) => ({ ...prev, fileType: event.target.value }))}>
              <MenuItem value={ALL}>All</MenuItem>
              {fileTypeFilterOptions.map((fileType) => (
                <MenuItem key={fileType} value={fileType}>
                  {formatFileType(fileType)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 0.6, minWidth: 110 }}>
            <InputLabel>Version</InputLabel>
            <Select value={filterDraft.version} label="Version" onChange={(event) => setFilterDraft((prev) => ({ ...prev, version: event.target.value }))}>
              <MenuItem value={ALL}>All</MenuItem>
              {versionFilterOptions.map((version) => (
                <MenuItem key={version} value={version}>
                  {version}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1, minWidth: 150 }}>
            <InputLabel>Artwork Type</InputLabel>
            <Select
              value={filterDraft.artworkType}
              label="Artwork Type"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, artworkType: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {ARTWORK_TYPE_OPTIONS.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1, minWidth: 150 }}>
            <InputLabel>Added By</InputLabel>
            <Select
              value={filterDraft.uploadedBy}
              label="Added By"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, uploadedBy: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {uploadedByFilterOptions.map((user) => (
                <MenuItem key={user} value={user}>
                  {user}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Added On From"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={filterDraft.uploadDateFrom}
            onChange={(event) => setFilterDraft((prev) => ({ ...prev, uploadDateFrom: event.target.value }))}
            sx={{ minWidth: 170 }}
          />
          <TextField
            label="Added On To"
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={filterDraft.uploadDateTo}
            onChange={(event) => setFilterDraft((prev) => ({ ...prev, uploadDateTo: event.target.value }))}
            sx={{ minWidth: 170 }}
          />
          <FormControl sx={{ flex: 1, minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select value={filterDraft.status} label="Status" onChange={(event) => setFilterDraft((prev) => ({ ...prev, status: event.target.value }))}>
              <MenuItem value={ALL}>All</MenuItem>
              {ARTWORK_STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="contained" sx={{ bgcolor: '#00A651', '&:hover': { bgcolor: '#00913f' } }} onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Button variant="outlined" sx={{ borderColor: '#D8DDE3', color: '#9EA4AB' }} onClick={handleClearFilters}>
            Clear Filters
          </Button>
        </Box>
      </Paper>

      {/* Tabs, Upload button, and the table itself are one continuous box —
          no visual seam between them. */}
      <Paper sx={{ borderRadius: 3, mb: 3 }}>
        <Tabs
          value={statusTab}
          onChange={(_, value: ArtworkTab) => setStatusTab(value)}
          textColor="primary"
          indicatorColor="primary"
          sx={{ px: 2, pt: 1 }}
        >
          {ARTWORK_TABS.map((tab) => (
            <Tab key={tab} value={tab} label={tab} sx={{ textTransform: 'none', fontWeight: 700 }} />
          ))}
        </Tabs>
        {canUpload && (
          <Box sx={{ px: 3, py: 2 }}>
            <Button variant="contained" sx={{ bgcolor: '#E26737', '&:hover': { bgcolor: '#d55b2f' } }} onClick={handleOpenUpload}>
              + Upload Artwork
            </Button>
          </Box>
        )}

        {filteredRows.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: '#9EA4AB' }}>
              {emptyMessage}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ height: 660, width: '100%', p: 3, pt: 0 }}>
            <DataGrid<Artwork>
              rows={filteredRows}
              columns={columns}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: defaultPageSize, page: 0 } } }}
              disableRowSelectionOnClick
              sx={{
                borderRadius: 3,
                borderColor: '#D8DDE3',
                '& .MuiDataGrid-columnHeaders': { bgcolor: '#F3F7FA', borderBottom: '1px solid #D8DDE3' },
                '& .MuiDataGrid-cell': { borderBottom: '1px solid #D8DDE3' }
              }}
            />
          </Box>
        )}
      </Paper>

      {/* Upload / Edit Artwork */}
      <Drawer anchor="right" open={formOpen} onClose={handleCloseForm}>
        <Box sx={{ width: { xs: 320, sm: 480 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {editingId ? 'Edit Artwork' : 'Upload Label / Artwork'}
            </Typography>
            <IconButton onClick={handleCloseForm}>
              <MdClose />
            </IconButton>
          </Box>

          {editingId ? (
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
                {formState.productName} — {formState.marketingCompany} — {formState.version}
              </Typography>
              <FormControl error={Boolean(formErrors.artworkType)}>
                <InputLabel>Artwork Type *</InputLabel>
                <Select value={formState.artworkType} label="Artwork Type *" onChange={handleArtworkTypeChange}>
                  {ARTWORK_TYPE_OPTIONS.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formState.status}
                  label="Status"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(event: SelectChangeEvent) => setFormState((prev) => ({ ...prev, status: event.target.value as any }))}
                >
                  {ARTWORK_STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Remarks"
                multiline
                minRows={3}
                value={formState.remarks}
                onChange={(event) => setFormState((prev) => ({ ...prev, remarks: event.target.value }))}
              />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Box>
                <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" hidden onChange={handleFileSelect} />
                <Button
                  variant="outlined"
                  startIcon={<MdUploadFile />}
                  sx={{ borderColor: '#00A651', color: '#2E3135', textTransform: 'none' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose Label File
                </Button>
                {selectedFile && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
                    <MdInsertDriveFile color="#9EA4AB" />
                    <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
                      {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </Typography>
                  </Box>
                )}
                {uploadErrors.file && (
                  <Typography variant="caption" sx={{ color: '#D32F2F', display: 'block', mt: 1 }}>
                    {uploadErrors.file}
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block', mt: 1 }}>
                  Supported: PDF, PNG, JPG — max {formatFileSize(MAX_ARTWORK_FILE_SIZE_BYTES)}. Uploading the label reads (and,
                  where needed, creates) the product it belongs to — there is no separate &quot;Add Product&quot; step.
                </Typography>
              </Box>

              {selectedFile && (
                <>
                  <Divider />

                  <Alert
                    severity={extractionError ? 'warning' : 'info'}
                    sx={{ borderRadius: 2 }}
                    action={
                      extractionError && !extracting ? (
                        <Button color="inherit" size="small" onClick={handleRetryExtraction}>
                          Retry
                        </Button>
                      ) : undefined
                    }
                  >
                    {extracting
                      ? 'Reading label…'
                      : extractionError
                        ? extractionError
                        : 'Fields below were read automatically from the label using OCR. Review and correct anything before saving — a blank field means it could not be confidently read.'}
                  </Alert>

                  <FormControl error={Boolean(formErrors.artworkType)}>
                    <InputLabel>Artwork Type *</InputLabel>
                    <Select value={uploadArtworkType} label="Artwork Type *" onChange={(event: SelectChangeEvent) => setUploadArtworkType(event.target.value as ArtworkType)}>
                      {ARTWORK_TYPE_OPTIONS.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Version"
                    value={uploadVersion}
                    onChange={(event) => {
                      setUploadVersion(event.target.value);
                      setVersionTouched(true);
                    }}
                    helperText="Auto-suggested from existing versions for this product — edit if needed."
                  />

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
                    Extracted Label Information
                  </Typography>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Product Name *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.productName)} />
                    </Box>
                    <TextField
                      fullWidth
                      value={labelForm.productName}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, productName: event.target.value }))}
                      error={Boolean(uploadErrors.productName)}
                      helperText={uploadErrors.productName}
                      slotProps={{ htmlInput: { 'aria-label': 'Product Name' } }}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Party *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.marketingCompanyName)} />
                    </Box>
                    <Autocomplete
                      freeSolo
                      options={marketingCompanyOptions}
                      inputValue={labelForm.marketingCompanyName}
                      onInputChange={(_, value) => setLabelForm((prev) => ({ ...prev, marketingCompanyName: value }))}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          placeholder="Enter the party printed on the label"
                          error={Boolean(uploadErrors.marketingCompanyName)}
                          helperText={uploadErrors.marketingCompanyName}
                        />
                      )}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Brand *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.brand)} />
                    </Box>
                    <Autocomplete
                      freeSolo
                      options={brandOptions}
                      inputValue={labelForm.brand}
                      onInputChange={(_, value) => setLabelForm((prev) => ({ ...prev, brand: value }))}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Enter brand" error={Boolean(uploadErrors.brand)} helperText={uploadErrors.brand} />
                      )}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Flavour *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.flavour)} />
                    </Box>
                    <Autocomplete
                      freeSolo
                      options={flavourOptions}
                      inputValue={labelForm.flavour}
                      onInputChange={(_, value) => setLabelForm((prev) => ({ ...prev, flavour: value }))}
                      renderInput={(params) => (
                        <TextField {...params} placeholder="Enter flavour" error={Boolean(uploadErrors.flavour)} helperText={uploadErrors.flavour} />
                      )}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Package Size *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.packageSize)} />
                    </Box>
                    <TextField
                      fullWidth
                      value={labelForm.packageSize}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, packageSize: event.target.value }))}
                      error={Boolean(uploadErrors.packageSize)}
                      helperText={uploadErrors.packageSize || 'Net content / count printed on the front of the label, e.g. "60 Gummies" or "150 g".'}
                      placeholder='e.g. "60 Gummies"'
                      slotProps={{ htmlInput: { 'aria-label': 'Package Size' } }}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        FSSAI Number *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.fssaiNumber)} />
                    </Box>
                    <TextField
                      fullWidth
                      value={labelForm.fssaiNumber}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, fssaiNumber: event.target.value }))}
                      error={Boolean(uploadErrors.fssaiNumber)}
                      helperText={uploadErrors.fssaiNumber}
                      slotProps={{ htmlInput: { 'aria-label': 'FSSAI Number' } }}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Address *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.address)} />
                    </Box>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      value={labelForm.address}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, address: event.target.value }))}
                      error={Boolean(uploadErrors.address)}
                      helperText={uploadErrors.address}
                      slotProps={{ htmlInput: { 'aria-label': 'Address' } }}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Email *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.email)} />
                    </Box>
                    <TextField
                      fullWidth
                      value={labelForm.email}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, email: event.target.value }))}
                      error={Boolean(uploadErrors.email)}
                      helperText={uploadErrors.email}
                      slotProps={{ htmlInput: { 'aria-label': 'Email' } }}
                    />
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Customer Care Number *
                      </Typography>
                      <StatusChip status={fieldStatus(labelForm.customerCareNumber)} />
                    </Box>
                    <TextField
                      fullWidth
                      value={labelForm.customerCareNumber}
                      onChange={(event) => setLabelForm((prev) => ({ ...prev, customerCareNumber: event.target.value }))}
                      error={Boolean(uploadErrors.customerCareNumber)}
                      helperText={uploadErrors.customerCareNumber}
                      slotProps={{ htmlInput: { 'aria-label': 'Customer Care Number' } }}
                    />
                  </Box>

                  {exactProductMatch && (
                    <Alert severity="success" sx={{ borderRadius: 2 }}>
                      Matches existing product {exactProductMatch.id} — {exactProductMatch.productName}. This artwork will be
                      saved as a new version of that product; no duplicate product will be created.
                    </Alert>
                  )}

                  {!exactProductMatch && possibleMatches.length > 0 && (
                    <Box>
                      <Alert severity="warning" sx={{ borderRadius: 2, mb: 1 }}>
                        {possibleMatches.length} existing product{possibleMatches.length > 1 ? 's' : ''} with this Brand and
                        Party {possibleMatches.length > 1 ? 'were' : 'was'} found. Select the matching product below,
                        or confirm this is a new product.
                      </Alert>
                      <FormControl fullWidth error={Boolean(uploadErrors.linkChoice)}>
                        <InputLabel>Matching Product *</InputLabel>
                        <Select
                          value={linkToProductId}
                          label="Matching Product *"
                          onChange={(event: SelectChangeEvent) => setLinkToProductId(event.target.value)}
                        >
                          <MenuItem value={NEW_PRODUCT_CHOICE}>— This is a new product —</MenuItem>
                          {possibleMatches.map((product) => (
                            <MenuItem key={product.id} value={product.id}>
                              {product.id} — {product.productName} ({product.flavour})
                            </MenuItem>
                          ))}
                        </Select>
                        {uploadErrors.linkChoice && <FormHelperText>{uploadErrors.linkChoice}</FormHelperText>}
                      </FormControl>
                    </Box>
                  )}

                  <TextField
                    label="Remarks"
                    multiline
                    minRows={2}
                    value={uploadRemarks}
                    onChange={(event) => setUploadRemarks(event.target.value)}
                  />

                  {uploadErrors.submit && (
                    <Typography variant="caption" sx={{ color: '#D32F2F' }}>
                      {uploadErrors.submit}
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
            <Button onClick={handleCloseForm} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" sx={{ textTransform: 'none' }} onClick={handleSave} disabled={!editingId && !selectedFile}>
              {editingId ? 'Save Changes' : 'Save Label & Product'}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Duplicate version warning */}
      <Dialog open={Boolean(duplicateMatch)} onClose={() => setDuplicateMatch(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Artwork version already exists</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 2 }}>
            Artwork version already exists for this product and company:
          </Typography>
          {duplicateMatch && (
            <Paper sx={{ p: 2, bgcolor: '#EEF1F4' }}>
              <Typography variant="body2">
                <strong>{duplicateMatch.productName}</strong> ({duplicateMatch.id})
              </Typography>
              <Typography variant="body2">Party: {duplicateMatch.marketingCompany}</Typography>
              <Typography variant="body2">Version: {duplicateMatch.version}</Typography>
              <Typography variant="body2">Artwork Type: {duplicateMatch.artworkType}</Typography>
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

      {/* Label uploaded confirmation */}
      <Dialog open={Boolean(intakeResult)} onClose={() => setIntakeResult(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Label Uploaded</DialogTitle>
        <DialogContent>
          {intakeResult && (
            <Stack spacing={1}>
              <Typography variant="body2">
                Artwork <strong>{intakeResult.artwork.id}</strong> ({intakeResult.artwork.version}) has been saved as a Draft.
              </Typography>
              <Typography variant="body2">
                {intakeResult.isNewProduct
                  ? `A new product record was created: ${intakeResult.product.id} — ${intakeResult.product.productName}.`
                  : `Linked to existing product: ${intakeResult.product.id} — ${intakeResult.product.productName}.`}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button variant="contained" sx={{ textTransform: 'none' }} onClick={() => setIntakeResult(null)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Archive Artwork</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#9EA4AB' }}>
            Are you sure you want to archive this artwork?
          </Typography>
          {archiveTarget && (
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>
              {archiveTarget.productName} — {archiveTarget.version} ({archiveTarget.id})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setArchiveTarget(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={handleConfirmArchive}>
            Archive
          </Button>
        </DialogActions>
      </Dialog>

      {/* Artwork Details */}
      <Dialog
        open={viewOpen}
        onClose={() => { setViewOpen(false); setViewFullscreen(false); }}
        maxWidth="md"
        fullWidth
        fullScreen={viewFullscreen}
      >
        {viewArtwork && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MdInsertDriveFile color="#E26737" size={22} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Artwork Details
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" onClick={() => setViewFullscreen((prev) => !prev)} title={viewFullscreen ? 'Restore' : 'Maximize'}>
                  {viewFullscreen ? <MdCloseFullscreen size={18} /> : <MdOpenInFull size={18} />}
                </IconButton>
                <IconButton onClick={() => { setViewOpen(false); setViewFullscreen(false); }}>
                  <MdClose />
                </IconButton>
              </Box>
            </DialogTitle>

            <DialogContent dividers>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" sx={{ color: '#9EA4AB', fontWeight: 700 }}>
                  {viewArtwork.id} — {viewArtwork.version}
                </Typography>
                <StatusChip status={viewArtwork.status} />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: '#F3D9C9' }}>
                  <ArtworkPreview artwork={viewArtwork} variant="card" height={140} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1.5 }}>
                    {viewArtwork.productName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#9EA4AB', mb: 1.5 }}>
                    {viewArtwork.marketingCompany}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <MdCategory color="#9EA4AB" size={16} />
                      <Box>
                        <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block', lineHeight: 1.2 }}>
                          Artwork Type
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {viewArtwork.artworkType}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <MdHistory color="#9EA4AB" size={16} />
                      <Box>
                        <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block', lineHeight: 1.2 }}>
                          Version
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {viewArtwork.version}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Artwork Preview
                  </Typography>
                  <ArtworkPreview artwork={viewArtwork} variant="panel" />
                </Paper>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Artwork Information
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    {(
                      [
                        [MdBookmark, 'Artwork ID', viewArtwork.id],
                        [MdConfirmationNumber, 'Product ID', viewArtwork.productId],
                        [MdInventory2, 'Product Name', viewArtwork.productName],
                        [MdBusiness, 'Party', viewArtwork.marketingCompany],
                        [MdHistory, 'Version', viewArtwork.version],
                        [MdCategory, 'Artwork Type', viewArtwork.artworkType],
                        [MdDescription, 'File Name', viewArtwork.fileName || '—'],
                        [MdStorage, 'File Size', formatFileSize(viewArtwork.fileSize)],
                        [MdPerson, 'Uploaded By', viewArtwork.uploadedBy],
                        [MdCalendarToday, 'Update Date', formatDateTime(viewArtwork.uploadDate)],
                        [MdComment, 'Remarks', viewArtwork.remarks || '—']
                      ] as [typeof MdBookmark, string, string][]
                    ).map(([Icon, label, value]) => (
                      <Box key={label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Icon color="#9EA4AB" size={16} style={{ marginTop: 3, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block', lineHeight: 1.2 }}>
                            {label}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                            {value}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Version History
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    {versionHistory.map((version) => (
                      <Paper
                        key={version.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          cursor: 'pointer',
                          borderLeft: version.id === viewArtwork.id ? '4px solid #E26737' : '4px solid transparent',
                          bgcolor: version.id === viewArtwork.id ? '#FFF8F2' : undefined,
                          '&:hover': { bgcolor: '#FFF8F2' }
                        }}
                        onClick={() => setViewArtwork(version)}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {version.version}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#9EA4AB' }}>
                              Uploaded by {version.uploadedBy}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <StatusChip status={version.status} />
                            <Typography variant="caption" sx={{ color: '#9EA4AB', display: 'block', mt: 0.5 }}>
                              {formatDateTime(version.uploadDate)}
                            </Typography>
                          </Box>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button variant="outlined" sx={{ textTransform: 'none' }} disabled={!viewArtwork.filePath} onClick={() => handleDownload(viewArtwork)}>
                Download
              </Button>
              {canEdit && (
                <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(viewArtwork)}>
                  Edit
                </Button>
              )}
              {canSendForComparison && viewArtwork.status !== 'Archived' && (
                <Button variant="contained" sx={{ bgcolor: '#00A651', '&:hover': { bgcolor: '#00913f' }, textTransform: 'none' }} onClick={() => handleSendForComparison(viewArtwork)}>
                  Send for Comparison
                </Button>
              )}
              {canEdit && viewArtwork.status !== 'Archived' && (
                <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={() => setArchiveTarget(viewArtwork)}>
                  Archive
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
