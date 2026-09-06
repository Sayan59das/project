const fs = require('fs');

function fixArtworkPage() {
  let content = fs.readFileSync('src/pages/ArtworkPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { formatDateTime } from '../utils/dateFormat';",
      "import { formatDateTime } from '../utils/dateFormat';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }

  // Replace defaultPageSize and add useMasterData
  content = content.replace(
    /const defaultPageSize = getSettings\(currentUser\?\.id \?\? ''\)\.pageSize;/,
    "const defaultPageSize = getSettings(currentUser?.id ?? '').pageSize;\n  const { artworks, refetchArtworks, brands, flavours, marketingCompanies, products } = useMasterData();"
  );
  
  // Replace getArtworks
  content = content.replace(
    /const \[artworks, setArtworks\] = useState<Artwork\[\]>\(\(\) => getArtworks\(\)\);/,
    ''
  );
  content = content.replace(
    /const refresh = \(\) => setArtworks\(getArtworks\(\)\);/,
    'const refresh = () => refetchArtworks();'
  );

  // Replace getMarketingCompanies
  content = content.replace(
    /const marketingCompanyOptions = useMemo\(\(\) => getMarketingCompanies\(\)\.map\(\(company\) => company\.companyName\), \[\]\);/,
    'const marketingCompanyOptions = useMemo(() => marketingCompanies.map((company) => company.companyName), [marketingCompanies]);'
  );

  // Replace getBrands
  content = content.replace(
    /const all = getBrands\(\);/g,
    'const all = brands;'
  );

  // Replace getFlavours
  content = content.replace(
    /const flavourOptions = useMemo\(\(\) => getFlavours\(\)\.map\(\(flavour\) => flavour\.flavourName\), \[\]\);/,
    'const flavourOptions = useMemo(() => flavours.map((flavour) => flavour.flavourName), [flavours]);'
  );

  // For exactProductMatch and possibleMatches:
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

  // handleUploadSubmit async issue and setIntakeResult
  content = content.replace(
    /const handleUploadSubmit = \(\) => \{/,
    'const handleUploadSubmit = async () => {'
  );
  
  content = content.replace(
    /const result = submitLabelIntake\(/,
    'const result = await submitLabelIntake('
  );
  
  fs.writeFileSync('src/pages/ArtworkPage.tsx', content);
}

fixArtworkPage();
