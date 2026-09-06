const fs = require('fs');

function fixArtworkPage() {
  let content = fs.readFileSync('src/pages/ArtworkPage.tsx', 'utf8');

  // Fix artworks state
  content = content.replace(
    /const \[artworks, setArtworks\] = useState<Artwork\[\]>\(\(\) => getArtworks\(\)\);/,
    'const [artworks, setArtworks] = useState<Artwork[]>([]);\n  useEffect(() => { getArtworks().then(setArtworks); }, []);'
  );
  content = content.replace(
    /const refresh = \(\) => setArtworks\(getArtworks\(\)\);/,
    'const refresh = () => getArtworks().then(setArtworks);'
  );

  // Fix marketingCompanyOptions
  content = content.replace(
    /const marketingCompanyOptions = useMemo\(\(\) => getMarketingCompanies\(\)\.map\(\(company\) => company\.companyName\), \[\]\);/,
    `const [marketingCompanies, setMarketingCompanies] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [flavours, setFlavours] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    getMarketingCompanies().then(setMarketingCompanies);
    getBrands().then(setBrands);
    getFlavours().then(setFlavours);
    import('../services/productService').then(m => m.getProducts().then(setProducts));
  }, []);
  const marketingCompanyOptions = useMemo(() => marketingCompanies.map((company) => company.companyName), [marketingCompanies]);`
  );

  // Fix brandOptions
  content = content.replace(
    /const all = getBrands\(\);/g,
    'const all = brands;'
  );

  // Fix flavourOptions
  content = content.replace(
    /const flavourOptions = useMemo\(\(\) => getFlavours\(\)\.map\(\(flavour\) => flavour\.flavourName\), \[\]\);/,
    'const flavourOptions = useMemo(() => flavours.map((flavour) => flavour.flavourName), [flavours]);'
  );

  // Fix findExactProductMatch / findPossibleProductMatches
  // They return promises now, so we need local state for them
  content = content.replace(
    /const exactProductMatch = useMemo\(\(\) => findExactProductMatch\(labelForm\), \[labelForm\.productName, labelForm\.brand, labelForm\.marketingCompanyName\]\);/,
    `const [exactProductMatch, setExactProductMatch] = useState<any>(null);
  useEffect(() => {
    findExactProductMatch(labelForm).then(setExactProductMatch);
  }, [labelForm.productName, labelForm.brand, labelForm.marketingCompanyName]);`
  );

  content = content.replace(
    /const possibleMatches = useMemo\([\s\S]*?\[labelForm\.brand, labelForm\.marketingCompanyName, exactProductMatch\]\n  \);/,
    `const [possibleMatches, setPossibleMatches] = useState<any[]>([]);
  useEffect(() => {
    if (exactProductMatch) {
      setPossibleMatches([]);
    } else {
      findPossibleProductMatches(labelForm).then(setPossibleMatches);
    }
  }, [labelForm.brand, labelForm.marketingCompanyName, exactProductMatch]);`
  );

  // Fix intakeResult
  content = content.replace(
    /setIntakeResult\(result\);/g,
    'result.then ? result.then(setIntakeResult) : setIntakeResult(result);'
  );

  // Fix submitLabelIntake return type handling (it's async now)
  content = content.replace(
    /const result = submitLabelIntake\(/g,
    'const result = await submitLabelIntake('
  );
  
  // Make upload function async if it isn't
  content = content.replace(
    /const handleUploadSubmit = \(\) => {/g,
    'const handleUploadSubmit = async () => {'
  );

  fs.writeFileSync('src/pages/ArtworkPage.tsx', content);
}

function fixQAPage() {
  let content = fs.readFileSync('src/pages/QAPage.tsx', 'utf8');

  // Fix comparisons state
  content = content.replace(
    /const \[comparisons, setComparisons\] = useState<Comparison\[\]>\(\(\) => getComparisons\(\)\);/,
    'const [comparisons, setComparisons] = useState<Comparison[]>([]);\n  useEffect(() => { getComparisons().then(setComparisons); }, []);'
  );
  content = content.replace(
    /const refresh = \(\) => setComparisons\(getComparisons\(\)\);/,
    'const refresh = () => getComparisons().then(setComparisons);'
  );

  // Fix getArtworkVersionsForSelection
  // These return promises now, so we must await them. But they are used synchronously in QAPage.
  // Actually, we can just load all artworks once.
  content = content.replace(
    /getArtworkVersionsForSelection\(.*?\)\.find/g,
    'artworks.find'
  );
  
  // Need to define artworks
  content = content.replace(
    /const refresh = \(\) => getComparisons\(\)\.then\(setComparisons\);/,
    `const refresh = () => getComparisons().then(setComparisons);
  const [artworks, setArtworks] = useState<any[]>([]);
  useEffect(() => { import('../services/artworkService').then(m => m.getArtworks().then(setArtworks)); }, []);`
  );

  fs.writeFileSync('src/pages/QAPage.tsx', content);
}

function fixReportsPage() {
  let content = fs.readFileSync('src/pages/ReportsPage.tsx', 'utf8');

  content = content.replace(
    /const \[brands\] = useState<Brand\[\]>\(\(\) => getBrands\(\)\);/,
    'const [brands, setBrands] = useState<Brand[]>([]);\n  useEffect(() => { getBrands().then(setBrands); }, []);'
  );
  content = content.replace(
    /const \[marketingCompanies\] = useState<MarketingCompany\[\]>\(\(\) => getMarketingCompanies\(\)\);/,
    'const [marketingCompanies, setMarketingCompanies] = useState<MarketingCompany[]>([]);\n  useEffect(() => { getMarketingCompanies().then(setMarketingCompanies); }, []);'
  );
  content = content.replace(
    /const \[manufacturingCompanies\] = useState<ManufacturingCompany\[\]>\(\(\) => getManufacturingCompanies\(\)\);/,
    'const [manufacturingCompanies, setManufacturingCompanies] = useState<ManufacturingCompany[]>([]);\n  useEffect(() => { getManufacturingCompanies().then(setManufacturingCompanies); }, []);'
  );
  content = content.replace(
    /const \[products\] = useState<Product\[\]>\(\(\) => getProducts\(\)\);/,
    'const [products, setProducts] = useState<Product[]>([]);\n  useEffect(() => { getProducts().then(setProducts); }, []);'
  );
  content = content.replace(
    /const \[artworks\] = useState<Artwork\[\]>\(\(\) => getArtworks\(\)\);/,
    'const [artworks, setArtworks] = useState<Artwork[]>([]);\n  useEffect(() => { getArtworks().then(setArtworks); }, []);'
  );
  content = content.replace(
    /const \[comparisons\] = useState<Comparison\[\]>\(\(\) => getComparisons\(\)\);/,
    'const [comparisons, setComparisons] = useState<Comparison[]>([]);\n  useEffect(() => { getComparisons().then(setComparisons); }, []);'
  );

  fs.writeFileSync('src/pages/ReportsPage.tsx', content);
}

function fixTestFile() {
  if (fs.existsSync('src/services/__tests__/labelIntakeService.test.ts')) {
    let content = fs.readFileSync('src/services/__tests__/labelIntakeService.test.ts', 'utf8');
    content = content.replace(/await expect\(productService\.getProductById\(result\.productId\)\)/g, 'await expect(await productService.getProductById(result.productId))');
    fs.writeFileSync('src/services/__tests__/labelIntakeService.test.ts', content);
  }
}

fixArtworkPage();
fixQAPage();
fixReportsPage();
fixTestFile();
console.log("Pages fixed");
