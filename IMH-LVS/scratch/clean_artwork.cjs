const fs = require('fs');

function fixArtworkPage() {
  let content = fs.readFileSync('src/pages/ArtworkPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { getSettings } from '../services/settingsService';",
      "import { getSettings } from '../services/settingsService';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }

  // Remove the previous dirty fix for artworks
  content = content.replace(
    /const \[artworks, setArtworks\] = useState<Artwork\[\]>\(\[\]\);\n  useEffect\(\(\) => \{ getArtworks\(\)\.then\(setArtworks\); \}, \[\]\);/g,
    ''
  );
  content = content.replace(
    /const refresh = \(\) => getArtworks\(\)\.then\(setArtworks\);/g,
    ''
  );
  
  // Remove the dirty fix for marketing companies, brands, flavours, products
  content = content.replace(
    /const \[marketingCompanies, setMarketingCompanies\] = useState<any\[\]>\(\[\]\);\n  const \[brands, setBrands\] = useState<any\[\]>\(\[\]\);\n  const \[flavours, setFlavours\] = useState<any\[\]>\(\[\]\);\n  const \[products, setProducts\] = useState<any\[\]>\(\[\]\);\n  useEffect\(\(\) => \{\n    getMarketingCompanies\(\)\.then\(setMarketingCompanies\);\n    getBrands\(\)\.then\(setBrands\);\n    getFlavours\(\)\.then\(setFlavours\);\n    import\('\.\.\/services\/productService'\)\.then\(m => m\.getProducts\(\)\.then\(setProducts\)\);\n  \}, \[\]\);/g,
    ''
  );

  // Add useMasterData call at top of ArtworkPage
  content = content.replace(
    /const defaultPageSize = getSettings\(currentUser\?\.id \?\? ''\)\.pageSize;/,
    'const defaultPageSize = getSettings(currentUser?.id ?? \'\').pageSize;\n  const { artworks, refetchArtworks: refresh, brands, flavours, marketingCompanies, products } = useMasterData();'
  );

  // Replace exact/possible matches since they use getProducts directly inside those service methods
  // Wait, I already added state for exactProductMatch. Let's make sure it's clean.
  
  // There are some getProducts() calls in line 503/517 of the previous build output, probably:
  // const possibleMatches = getProducts().filter(...)
  // We can just use `products.filter(...)`
  
  content = content.replace(/getProducts\(\)/g, 'products');
  content = content.replace(/getArtworks\(\)/g, 'artworks');
  content = content.replace(/getBrands\(\)/g, 'brands');
  content = content.replace(/getFlavours\(\)/g, 'flavours');
  content = content.replace(/getMarketingCompanies\(\)/g, 'marketingCompanies');

  fs.writeFileSync('src/pages/ArtworkPage.tsx', content);
}

fixArtworkPage();
