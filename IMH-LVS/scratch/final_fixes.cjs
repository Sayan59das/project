const fs = require('fs');

function fixApprovalsPage() {
  let content = fs.readFileSync('src/pages/ApprovalsPage.tsx', 'utf8');

  // Fix useEffect import
  if (!content.includes('useEffect')) {
    content = content.replace(
      /import \{ useNavigate \} from 'react-router-dom';/,
      "import { useEffect, useState, useMemo } from 'react';\nimport { useNavigate } from 'react-router-dom';"
    );
  }

  // Restore selectedId and remarks
  if (!content.includes('const [selectedId, setSelectedId]')) {
    content = content.replace(
      /const \{ artworks, comparisons, refetchComparisons: refresh \} = useMasterData\(\);/,
      "const { artworks, comparisons, refetchComparisons: refresh } = useMasterData();\n  const [selectedId, setSelectedId] = useState<string | null>(null);\n  const [remarks, setRemarks] = useState('');"
    );
  }

  fs.writeFileSync('src/pages/ApprovalsPage.tsx', content);
}

function fixArtworkPage() {
  let content = fs.readFileSync('src/pages/ArtworkPage.tsx', 'utf8');

  content = content.replace(
    /const persist = \(\) => \{/,
    'const persist = async () => {'
  );

  // the possibleMatches error on lines 508, 1149, 1152, 1153:
  // "Property 'length' does not exist on type 'never[] | Promise<Product[]>'."
  // It's because in fix_artwork2.cjs, I replaced it but left `possibleMatches` typed as `any[]`.
  // Wait, the error says it's STILL `Promise<Product[]>`. Let me check if my previous replacement for exactProductMatch actually worked in ArtworkPage.tsx!
  // If it didn't match the regex, it might still be a Promise!
  // Let's force replace exactProductMatch and possibleMatches correctly!

  content = content.replace(
    /const exactProductMatch = useMemo\([\s\S]*?\n  \);/,
    `const [exactProductMatch, setExactProductMatch] = useState<any>(null);
  useEffect(() => {
    findExactProductMatch(labelForm).then(setExactProductMatch);
  }, [labelForm.productName, labelForm.brand, labelForm.marketingCompanyName]);`
  );

  content = content.replace(
    /const possibleMatches = useMemo\([\s\S]*?\n  \);/,
    `const [possibleMatches, setPossibleMatches] = useState<any[]>([]);
  useEffect(() => {
    if (exactProductMatch) {
      setPossibleMatches([]);
    } else {
      findPossibleProductMatches(labelForm).then(setPossibleMatches);
    }
  }, [labelForm.brand, labelForm.marketingCompanyName, exactProductMatch]);`
  );
  
  // also fix `.map` on `possibleMatches` if it still happens to complain
  content = content.replace(/possibleMatches\.map/g, '(possibleMatches || []).map');
  content = content.replace(/possibleMatches\.length/g, '(possibleMatches || []).length');

  fs.writeFileSync('src/pages/ArtworkPage.tsx', content);
}

function fixReportsPage() {
  let content = fs.readFileSync('src/pages/ReportsPage.tsx', 'utf8');
  
  // Fix missing dependencies and typings in referenceData
  // We need to add products, brands, etc to the useMemo dependencies
  content = content.replace(
    /return \{[\s\S]*?products: products,[\s\S]*?brands: Array\.from\(new Set\(brands\.map\(\(b\) => b\.brandName\)\)\)\.sort\(\),[\s\S]*?marketingCompanies: Array\.from\(new Set\(marketingCompanies\.map\(\(c\) => c\.companyName\)\)\)\.sort\(\),[\s\S]*?manufacturingCompanies: Array\.from\(new Set\(manufacturingCompanies\.map\(\(c\) => c\.companyName\)\)\)\.sort\(\),[\s\S]*?artworkVersions: Array\.from\(new Set\(artworks\.map\(\(a: any\) => a\.version\)\)\)\.sort\(\(a: string, b: string\) => parseVersionNumber\(a\) - parseVersionNumber\(b\)\),[\s\S]*?users: getUsers\(\)[\s\S]*?\.map\(\(u\) => u\.fullName\)[\s\S]*?\.sort\(\)[\s\S]*?\};/,
    `return {
        products: products,
        brands: Array.from(new Set(brands.map((b: any) => b.brandName))).sort(),
        marketingCompanies: Array.from(new Set(marketingCompanies.map((c: any) => c.companyName))).sort(),
        manufacturingCompanies: Array.from(new Set(manufacturingCompanies.map((c: any) => c.companyName))).sort(),
        artworkVersions: Array.from(new Set(artworks.map((a: any) => a.version))).sort((a: any, b: any) => parseVersionNumber(a) - parseVersionNumber(b)),
        users: getUsers()
          .map((u: any) => u.fullName)
          .sort()
      };`
  );
  
  // Fix useEffect missing import
  if (!content.includes('useEffect')) {
    content = content.replace(
      /import \{ useMemo, useState \} from 'react';/,
      "import { useEffect, useMemo, useState } from 'react';"
    );
  }

  // Fix product typing in Autocomplete options
  content = content.replace(
    /getOptionLabel=\{\(product\) =>/,
    'getOptionLabel={(product: any) =>'
  );
  
  // Fix duplicate react imports
  content = content.replace(
    /import \{ useState, useMemo \} from 'react';/,
    ''
  );

  fs.writeFileSync('src/pages/ReportsPage.tsx', content);
}

fixApprovalsPage();
fixArtworkPage();
fixReportsPage();
