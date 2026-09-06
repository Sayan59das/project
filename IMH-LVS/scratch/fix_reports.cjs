const fs = require('fs');

function fixReportsPage() {
  let content = fs.readFileSync('src/pages/ReportsPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { formatDateTime } from '../utils/dateFormat';",
      "import { formatDateTime } from '../utils/dateFormat';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }

  // Insert hook before useState
  content = content.replace(
    /const \[activeReport, setActiveReport\] = useState<ReportType>\('comparison'\);/,
    "const { products, brands, marketingCompanies, manufacturingCompanies, artworks } = useMasterData();\n  const [activeReport, setActiveReport] = useState<ReportType>('comparison');"
  );
  
  // Replace get functions in referenceData
  content = content.replace(
    /products: getProducts\(\),/,
    'products: products,'
  );
  content = content.replace(
    /brands: Array\.from\(new Set\(getBrands\(\)\.map\(\(b\) => b\.brandName\)\)\)\.sort\(\),/,
    'brands: Array.from(new Set(brands.map((b) => b.brandName))).sort(),'
  );
  content = content.replace(
    /marketingCompanies: Array\.from\(new Set\(getMarketingCompanies\(\)\.map\(\(c\) => c\.companyName\)\)\)\.sort\(\),/,
    'marketingCompanies: Array.from(new Set(marketingCompanies.map((c) => c.companyName))).sort(),'
  );
  content = content.replace(
    /manufacturingCompanies: Array\.from\(new Set\(getManufacturingCompanies\(\)\.map\(\(c\) => c\.companyName\)\)\)\.sort\(\),/,
    'manufacturingCompanies: Array.from(new Set(manufacturingCompanies.map((c) => c.companyName))).sort(),'
  );
  content = content.replace(
    /artworkVersions: Array\.from\(new Set\(getArtworks\(\)\.map\(\(a\) => a\.version\)\)\)\.sort\(\(a, b\) => parseVersionNumber\(a\) - parseVersionNumber\(b\)\),/,
    'artworkVersions: Array.from(new Set(artworks.map((a) => a.version))).sort((a, b) => parseVersionNumber(a) - parseVersionNumber(b)),'
  );

  // We have promises for all of these:
  /*
        case 'comparison':
          return getComparisonReport(effectiveFilters) as unknown as Record<string, unknown>[];
  */
  // All these functions return Promises now!
  content = content.replace(
    /const rows = useMemo<Record<string, unknown>\[\]>\(\(\) => \{[\s\S]*?\}, \[activeReport, effectiveFilters, revisionScope\]\);/,
    `const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    let active = true;
    const fetchRows = async () => {
      try {
        let result = [];
        switch (activeReport) {
          case 'comparison':
            result = await getComparisonReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'pending':
            result = await getPendingVerificationReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'approved':
            result = await getApprovedLabelsReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'revision':
            result = await getRevisionRejectionReport(effectiveFilters, revisionScope) as unknown as Record<string, unknown>[];
            break;
          case 'artwork':
            result = await getArtworkHistoryReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'approvalHistory':
            result = await getApprovalHistoryReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
          case 'userActivity':
            result = await getUserActivityReport(effectiveFilters) as unknown as Record<string, unknown>[];
            break;
        }
        if (active) setRows(result);
      } catch {
        if (active) setLoadError(true);
      }
    };
    fetchRows();
    return () => { active = false; };
  }, [activeReport, effectiveFilters, revisionScope]);`
  );

  fs.writeFileSync('src/pages/ReportsPage.tsx', content);
}

fixReportsPage();
