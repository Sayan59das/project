import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import {
  MdAssignment,
  MdBadge,
  MdBusiness,
  MdCalendarToday,
  MdClose,
  MdCloseFullscreen,
  MdCompareArrows,
  MdEdit,
  MdFactory,
  MdHistory,
  MdIcecream,
  MdInventory2,
  MdLocalOffer,
  MdOpenInFull,
  MdPerson,
  MdReceiptLong,
  MdRemoveRedEye,
  MdSearch,
  MdSource
} from 'react-icons/md';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';
import { useAuth } from '../auth/AuthContext';
import { deactivateProduct, updateProduct } from '../services/productService';
import { useInvalidateProducts, useProducts } from '../hooks/useProducts';
import { useBrands, useFlavours, useMarketingCompanies } from '../hooks/useMasterData';
import { getArtworksByProduct } from '../services/artworkService';
import { getComparisonsByProduct } from '../services/comparisonService';
import { getSettings } from '../services/settingsService';
import { PRODUCT_STATUS_OPTIONS, Product, ProductInput } from '../types/product';
import { formatDateTime } from '../utils/dateFormat';

const ALL = 'All';

type FilterState = {
  productName: string;
  brand: string;
  marketingCompany: string;
  flavour: string;
  fssaiNumber: string;
  status: string;
};

const EMPTY_FILTERS: FilterState = {
  productName: ALL,
  brand: ALL,
  marketingCompany: ALL,
  flavour: ALL,
  fssaiNumber: ALL,
  status: ALL
};

function emptyForm(): ProductInput {
  return {
    productName: '',
    brandName: '',
    marketingCompany: '',
    manufacturingCompany: '',
    flavour: '',
    fssaiNumber: '',
    status: 'Active'
  };
}

type FormErrors = Partial<Record<'productName' | 'brandName' | 'marketingCompany', string>>;

export function ProductsPage() {
  const { currentUser, hasPermission } = useAuth();
  const marketingCompanies = useMarketingCompanies();
  const brands = useBrands();
  const flavours = useFlavours();
  const canEdit = hasPermission('EDIT');
  const defaultPageSize = getSettings(currentUser?.id ?? '').pageSize;

  const { products, isLoading, isError: productsFailed, error: productsError } = useProducts();
  const invalidateProducts = useInvalidateProducts();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [filterDraft, setFilterDraft] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ProductInput>(emptyForm());
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const [viewOpen, setViewOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewFullscreen, setViewFullscreen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Product | null>(null);

  // Filter dropdowns reflect whatever values actually exist across products
  // today (active or historical/inactive master values alike).
  const productNameOptions = useMemo(() => Array.from(new Set(products.map((product) => product.productName))).sort(), [products]);
  const brandOptions = useMemo(() => Array.from(new Set(products.map((product) => product.brandName))).sort(), [products]);
  const marketingCompanyOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.marketingCompany))).sort(),
    [products]
  );
  const flavourOptions = useMemo(() => Array.from(new Set(products.map((product) => product.flavour))).sort(), [products]);
  const fssaiNumberOptions = useMemo(() => Array.from(new Set(products.map((product) => product.fssaiNumber))).sort(), [products]);

  // Add/Edit form dropdowns only offer ACTIVE master records for new
  // selections, but always keep the record's current saved value selectable
  // even if that master has since gone inactive â€” so editing a product never
  // silently blanks out its historical value.
  const activeMarketingCompanies = useMemo(
    () => marketingCompanies.items.filter((company) => company.status === 'Active').map((company) => company.companyName),
    [marketingCompanies.items]
  );
  const activeBrands = useMemo(
    () => brands.items.filter((brand) => brand.status === 'Active').map((brand) => brand.brandName),
    [brands.items]
  );
  const activeFlavours = useMemo(
    () => flavours.items.filter((flavour) => flavour.status === 'Active').map((flavour) => flavour.flavourName),
    [flavours.items]
  );

  // Masters are fetched now, so a form opened during an outage would offer
  // three empty dropdowns and look like a system with no brands in it. Say so
  // instead — the form still opens, and a typed value is still savable.
  const mastersFailed = marketingCompanies.isError || brands.isError || flavours.isError;

  const withCurrentValue = (options: string[], current: string) => (current && !options.includes(current) ? [...options, current] : options);

  const mastersError = [marketingCompanies, brands, flavours].find((query) => query.isError)?.error;

  const marketingCompanyFormOptions = withCurrentValue(activeMarketingCompanies, formState.marketingCompany);
  const brandFormOptions = withCurrentValue(activeBrands, formState.brandName);
  const flavourFormOptions = withCurrentValue(activeFlavours, formState.flavour);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [
          product.productName,
          product.brandName,
          product.marketingCompany,
          product.manufacturingCompany,
          product.flavour,
          product.fssaiNumber
        ].some((value) => value.toLowerCase().includes(term));

      const matchesProductName = appliedFilters.productName === ALL || product.productName === appliedFilters.productName;
      const matchesMarketing = appliedFilters.marketingCompany === ALL || product.marketingCompany === appliedFilters.marketingCompany;
      const matchesBrand = appliedFilters.brand === ALL || product.brandName === appliedFilters.brand;
      const matchesFlavour = appliedFilters.flavour === ALL || product.flavour === appliedFilters.flavour;
      const matchesFssai = appliedFilters.fssaiNumber === ALL || product.fssaiNumber === appliedFilters.fssaiNumber;
      const matchesStatus = appliedFilters.status === ALL || product.status === appliedFilters.status;

      return matchesSearch && matchesProductName && matchesMarketing && matchesBrand && matchesFlavour && matchesFssai && matchesStatus;
    });
  }, [products, search, appliedFilters]);

  const filtersActive = Object.values(appliedFilters).some((value) => value !== ALL);

  // Loading, failed, filtered-to-nothing and genuinely empty are four
  // different tables. Only the last two are about the data.
  const emptyMessage = isLoading
    ? 'Loading…'
    : productsFailed
      ? 'Could not load products.'
      : products.length === 0
        ? 'No products found.'
        : search.trim() !== ''
          ? 'No products match your search.'
          : filtersActive
            ? 'No products match the selected filters.'
            : 'No products found.';

  const handleApplyFilters = () => setAppliedFilters(filterDraft);
  const handleClearFilters = () => {
    setFilterDraft(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingId(product.id);
    setFormState({
      productName: product.productName,
      brandName: product.brandName,
      marketingCompany: product.marketingCompany,
      manufacturingCompany: product.manufacturingCompany,
      flavour: product.flavour,
      fssaiNumber: product.fssaiNumber,
      status: product.status
    });
    setFormErrors({});
    setViewOpen(false);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
  };

  const handleTextChange = (field: 'productName' | 'fssaiNumber') => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSelectChange =
    (field: 'brandName' | 'marketingCompany' | 'flavour' | 'status') => (event: SelectChangeEvent) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value } as ProductInput));
    };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    if (!formState.productName.trim()) errors.productName = 'Product Name is required.';
    if (!formState.brandName.trim()) errors.brandName = 'Brand Name is required.';
    if (!formState.marketingCompany.trim()) errors.marketingCompany = 'Party is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Product Management no longer creates products manually â€” every record
  // comes from the label upload pipeline (see ArtworkPage / labelIntakeService).
  // This drawer/handleSave path only ever runs against an existing product.
  const handleSave = async () => {
    if (!editingId || !validate()) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateProduct(editingId, formState);
      invalidateProducts();
      setFormOpen(false);
    } catch (error) {
      // The drawer stays open with what was typed: nothing was saved.
      setSaveError(error instanceof Error ? error.message : 'Could not save this product.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenView = (product: Product) => {
    setViewProduct(product);
    setViewOpen(true);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const target = deactivateTarget;
    setDeactivateTarget(null);
    try {
      await deactivateProduct(target.id);
      invalidateProducts();
      setViewProduct((prev) => (prev && prev.id === target.id ? { ...prev, status: 'Inactive' } : prev));
    } catch (error) {
      // Nothing changed, so the details panel must not show Inactive.
      setSaveError(error instanceof Error ? error.message : 'Could not deactivate this product.');
    }
  };

  const columns: GridColDef<Product>[] = [
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 100,
      flex: 0.6,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="View">
            <IconButton size="small" sx={{ color: 'var(--c-orange)' }} onClick={() => handleOpenView(params.row)}>
              <MdRemoveRedEye size={18} />
            </IconButton>
          </Tooltip>
          {canEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" sx={{ color: 'var(--c-green)' }} onClick={() => handleOpenEdit(params.row)}>
                <MdEdit size={18} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )
    },
    { field: 'productName', headerName: 'Product Name', minWidth: 190, flex: 1.4 },
    { field: 'brandName', headerName: 'Brand', minWidth: 140, flex: 1 },
    { field: 'marketingCompany', headerName: 'Party', minWidth: 170, flex: 1.2 },
    { field: 'flavour', headerName: 'Flavour', minWidth: 120, flex: 0.8 },
    { field: 'fssaiNumber', headerName: 'FSSAI Number', minWidth: 160, flex: 1 },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 150,
      flex: 1,
      renderCell: (params) => <StatusChip status={String(params.value ?? '')} />
    },
    { field: 'updatedDate', headerName: 'Last Updated', minWidth: 130, flex: 0.9, renderCell: (params) => formatDateTime(String(params.value ?? '')) }
  ];

  // Product Details drawer's audit sections â€” sourced from the real
  // artwork/comparison records for this product, not placeholder text.
  const viewArtworks = viewProduct ? getArtworksByProduct(viewProduct.id) : [];
  const viewComparisons = viewProduct ? getComparisonsByProduct(viewProduct.id) : [];
  const viewVersions = Array.from(new Set(viewArtworks.map((artwork) => artwork.version))).sort();
  const viewApprovalHistory = viewComparisons
    .flatMap((comparison) => comparison.history.map((entry) => ({ ...entry, comparisonId: comparison.id })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <Box>
      <PageHeader title="Products" />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Paper
          component="form"
          onSubmit={(event) => event.preventDefault()}
          elevation={0}
          sx={{ display: 'flex', alignItems: 'center', p: '10px 14px', borderRadius: 3, bgcolor: 'var(--c-tint-green)', border: '1px solid var(--c-border-green)', mb: 3 }}
        >
          <MdSearch size={18} color="var(--c-text-3)" />
          <InputBase
            sx={{ ml: 1.5, flex: 1, fontSize: 14 }}
            placeholder="Search by name, brand, company, flavour, or FSSAI number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Paper>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'var(--c-text-2)' }}>
          Filters
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControl sx={{ flex: 1.4, minWidth: 170 }}>
            <InputLabel>Product Name</InputLabel>
            <Select
              value={filterDraft.productName}
              label="Product Name"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, productName: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {productNameOptions.map((productName) => (
                <MenuItem key={productName} value={productName}>
                  {productName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1, minWidth: 140 }}>
            <InputLabel>Brand</InputLabel>
            <Select
              value={filterDraft.brand}
              label="Brand"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, brand: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {brandOptions.map((brand) => (
                <MenuItem key={brand} value={brand}>
                  {brand}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1.2, minWidth: 170 }}>
            <InputLabel>Party</InputLabel>
            <Select
              value={filterDraft.marketingCompany}
              label="Party"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, marketingCompany: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {marketingCompanyOptions.map((company) => (
                <MenuItem key={company} value={company}>
                  {company}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 0.8, minWidth: 120 }}>
            <InputLabel>Flavour</InputLabel>
            <Select
              value={filterDraft.flavour}
              label="Flavour"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, flavour: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {flavourOptions.map((flavour) => (
                <MenuItem key={flavour} value={flavour}>
                  {flavour}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1, minWidth: 160 }}>
            <InputLabel>FSSAI Number</InputLabel>
            <Select
              value={filterDraft.fssaiNumber}
              label="FSSAI Number"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, fssaiNumber: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {fssaiNumberOptions.map((fssaiNumber) => (
                <MenuItem key={fssaiNumber} value={fssaiNumber}>
                  {fssaiNumber}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ flex: 1, minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filterDraft.status}
              label="Status"
              onChange={(event) => setFilterDraft((prev) => ({ ...prev, status: event.target.value }))}
            >
              <MenuItem value={ALL}>All</MenuItem>
              {PRODUCT_STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="contained" sx={{ bgcolor: 'var(--c-green)', '&:hover': { bgcolor: 'var(--c-green-600)' } }} onClick={handleApplyFilters}>
            Apply Filters
          </Button>
          <Button variant="outlined" sx={{ borderColor: 'var(--c-border)', color: 'var(--c-text-3)' }} onClick={handleClearFilters}>
            Clear Filters
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        {/* The catalogue failing to load is reported, with the server's own
            sentence. An empty grid under a silent error tells a reviewer there
            are no products to review. */}
        {productsFailed && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {productsError instanceof Error ? productsError.message : 'Could not load products.'}
          </Alert>
        )}
        {saveError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}

        {filteredRows.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: 'var(--c-text-3)' }}>
              {emptyMessage}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ height: 660, width: '100%' }}>
            <DataGrid<Product>
              rows={filteredRows}
              columns={columns}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: defaultPageSize, page: 0 } } }}
              disableRowSelectionOnClick
              sx={{
                borderRadius: 3,
                borderColor: 'var(--c-border)',
                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: 'var(--c-tint-blue)',
                  borderBottom: '1px solid var(--c-border)'
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid var(--c-border)'
                }
              }}
            />
          </Box>
        )}
      </Paper>

      {/* Add / Edit Product */}
      <Drawer anchor="right" open={formOpen} onClose={handleCloseForm}>
        <Box sx={{ width: { xs: 320, sm: 440 }, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Edit Product
            </Typography>
            <IconButton onClick={handleCloseForm}>
              <MdClose />
            </IconButton>
          </Box>

          {mastersFailed && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {mastersError instanceof Error ? mastersError.message : 'Could not load master data.'} The dropdowns below are
              incomplete — an empty list here means the lookup failed, not that there are no records.
            </Alert>
          )}

          <Stack spacing={2}>
            <TextField
              label="Product Name *"
              value={formState.productName}
              onChange={handleTextChange('productName')}
              error={Boolean(formErrors.productName)}
              helperText={formErrors.productName}
            />
            <FormControl error={Boolean(formErrors.brandName)}>
              <InputLabel>Brand Name *</InputLabel>
              <Select value={formState.brandName} label="Brand Name *" onChange={handleSelectChange('brandName')}>
                {brandFormOptions.map((brand) => (
                  <MenuItem key={brand} value={brand}>
                    {brand}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.brandName && <FormHelperText>{formErrors.brandName}</FormHelperText>}
            </FormControl>
            <FormControl error={Boolean(formErrors.marketingCompany)}>
              <InputLabel>Party *</InputLabel>
              <Select value={formState.marketingCompany} label="Party *" onChange={handleSelectChange('marketingCompany')}>
                {marketingCompanyFormOptions.map((company) => (
                  <MenuItem key={company} value={company}>
                    {company}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.marketingCompany && <FormHelperText>{formErrors.marketingCompany}</FormHelperText>}
            </FormControl>
            <FormControl>
              <InputLabel>Flavour</InputLabel>
              <Select value={formState.flavour} label="Flavour" onChange={handleSelectChange('flavour')}>
                {flavourFormOptions.map((flavour) => (
                  <MenuItem key={flavour} value={flavour}>
                    {flavour}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="FSSAI Number" value={formState.fssaiNumber} onChange={handleTextChange('fssaiNumber')} />
            <FormControl>
              <InputLabel>Status</InputLabel>
              <Select value={formState.status} label="Status" onChange={handleSelectChange('status')}>
                {PRODUCT_STATUS_OPTIONS.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
            <Button onClick={handleCloseForm} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button variant="contained" sx={{ textTransform: 'none' }} onClick={() => void handleSave()} disabled={isSaving}>
              Save Changes
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Deactivate confirmation */}
      <Dialog open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Deactivate Product</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
            Are you sure you want to deactivate this product?
          </Typography>
          {deactivateTarget && (
            <Typography variant="body2" sx={{ fontWeight: 700, mt: 1.5 }}>
              {deactivateTarget.productName} ({deactivateTarget.id})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeactivateTarget(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={() => void handleConfirmDeactivate()}>
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Product Details */}
      <Dialog
        open={viewOpen}
        onClose={() => { setViewOpen(false); setViewFullscreen(false); }}
        maxWidth="md"
        fullWidth
        fullScreen={viewFullscreen}
      >
        {viewProduct && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MdInventory2 color="var(--c-orange)" size={22} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Product Details
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
                <Typography variant="body2" sx={{ color: 'var(--c-text-3)', fontWeight: 700 }}>
                  {viewProduct.id} â€” {viewProduct.productName}
                </Typography>
                <StatusChip status={viewProduct.status} />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: 'var(--c-border-orange)' }}>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      bgcolor: 'var(--c-tint-orange-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 1.5
                    }}
                  >
                    <MdInventory2 color="var(--c-orange)" size={30} />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {viewProduct.productName}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--c-text-3)', mb: 1.5 }}>
                    {viewProduct.marketingCompany}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <MdLocalOffer color="var(--c-text-3)" size={16} />
                      <Box>
                        <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block', lineHeight: 1.2 }}>
                          Brand
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {viewProduct.brandName}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <MdIcecream color="var(--c-text-3)" size={16} />
                      <Box>
                        <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block', lineHeight: 1.2 }}>
                          Flavour
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {viewProduct.flavour}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Product Summary
                  </Typography>
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    {(
                      [
                        [MdInventory2, 'Artwork Records', viewArtworks.length],
                        [MdHistory, 'Label Versions', viewVersions.length],
                        [MdCompareArrows, 'Comparisons Run', viewComparisons.length]
                      ] as [typeof MdInventory2, string, number][]
                    ).map(([Icon, label, count]) => (
                      <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Icon color="var(--c-text-3)" size={16} />
                        <Typography variant="body2" sx={{ flex: 1, color: 'var(--c-text-3)' }}>
                          {label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {count}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Product Information
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    {(
                      [
                        [MdBadge, 'Product ID', viewProduct.id],
                        [MdInventory2, 'Product Name', viewProduct.productName],
                        [MdLocalOffer, 'Brand', viewProduct.brandName],
                        [MdBusiness, 'Party', viewProduct.marketingCompany],
                        [MdIcecream, 'Flavour', viewProduct.flavour],
                        [MdReceiptLong, 'FSSAI Number', viewProduct.fssaiNumber],
                        [MdFactory, 'Manufacturing Company', viewProduct.manufacturingCompany],
                        [MdPerson, 'Created By', viewProduct.createdBy],
                        [MdCalendarToday, 'Created Date', formatDateTime(viewProduct.createdDate)],
                        [MdPerson, 'Updated By', viewProduct.updatedBy],
                        [MdCalendarToday, 'Updated Date', formatDateTime(viewProduct.updatedDate)],
                        [
                          MdSource,
                          'Source',
                          viewProduct.origin === 'Label Upload'
                            ? `Label upload${viewProduct.sourceArtworkId ? ` (${viewProduct.sourceArtworkId})` : ''}`
                            : 'Manually entered'
                        ]
                      ] as [typeof MdBadge, string, string][]
                    ).map(([Icon, label, value]) => (
                      <Box key={label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <Icon color="var(--c-text-3)" size={16} style={{ marginTop: 3, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)', display: 'block', lineHeight: 1.2 }}>
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
                    Artwork
                  </Typography>
                  {viewArtworks.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                      No artwork available.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gap: 1 }}>
                      {viewArtworks.map((artwork) => (
                        <Paper key={artwork.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {artwork.version} â€” {artwork.artworkType}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                                {artwork.id}
                              </Typography>
                            </Box>
                            <StatusChip status={artwork.status} />
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <MdCompareArrows color="var(--c-text-3)" size={18} /> Comparison History
                  </Typography>
                  {viewComparisons.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                      No comparison history available.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gap: 1 }}>
                      {viewComparisons.map((comparison) => (
                        <Paper key={comparison.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {comparison.id}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                                {formatDateTime(comparison.updatedDate)}
                              </Typography>
                            </Box>
                            <StatusChip status={comparison.status} />
                          </Box>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <MdAssignment color="var(--c-text-3)" size={18} /> Approval History
                  </Typography>
                  {viewApprovalHistory.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'var(--c-text-3)' }}>
                      No approval history available.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'grid', gap: 1 }}>
                      {viewApprovalHistory.slice(0, 5).map((entry, index) => (
                        <Paper key={`${entry.comparisonId}-${index}`} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {entry.stage} â€” {entry.action}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>
                            {entry.actorName} Â· {formatDateTime(entry.date)}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
              {canEdit && (
                <Button variant="outlined" sx={{ textTransform: 'none' }} onClick={() => handleOpenEdit(viewProduct)}>
                  Edit Product
                </Button>
              )}
              {canEdit && viewProduct.status !== 'Inactive' && (
                <Button variant="contained" color="error" sx={{ textTransform: 'none' }} onClick={() => setDeactivateTarget(viewProduct)}>
                  Deactivate Product
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
