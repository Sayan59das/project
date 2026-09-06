const fs = require('fs');

function fixQAPage() {
  let content = fs.readFileSync('src/pages/QAPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { getComparisons, qaRejectComparison, qaVerifyComparison } from '../services/comparisonService';",
      "import { getComparisons, qaRejectComparison, qaVerifyComparison } from '../services/comparisonService';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }

  // Remove the old states and effects
  content = content.replace(
    /const \[comparisons, setComparisons\] = useState<Comparison\[\]>\(\[\]\);\n  useEffect\(\(\) => \{ getComparisons\(\)\.then\(setComparisons\); \}, \[\]\);\n  const refresh = \(\) => getComparisons\(\)\.then\(setComparisons\);\n  const \[artworks, setArtworks\] = useState<any\[\]>\(\[\]\);\n  useEffect\(\(\) => \{ import\('\.\.\/services\/artworkService'\)\.then\(m => m\.getArtworks\(\)\.then\(setArtworks\)\); \}, \[\]\);/g,
    ''
  );
  
  // Insert hook call
  content = content.replace(
    /const \[selectedId, setSelectedId\] = useState<string \| null>\(null\);/,
    'const { comparisons, artworks, refetchComparisons: refresh } = useMasterData();\n  const [selectedId, setSelectedId] = useState<string | null>(null);'
  );

  fs.writeFileSync('src/pages/QAPage.tsx', content);
}

function fixApprovalsPage() {
  let content = fs.readFileSync('src/pages/ApprovalsPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { Artwork } from '../types/artwork';",
      "import { Artwork } from '../types/artwork';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }

  // Insert hook call right after useAuth
  content = content.replace(
    /const \[queue, setQueue\] = useState<Comparison\[\]>\(\[\]\);/,
    'const { artworks, comparisons, refetchComparisons } = useMasterData();\n  const [queue, setQueue] = useState<Comparison[]>([]);'
  );
  
  content = content.replace(
    /const referenceArtwork = selectedItem\n    \? getArtworkVersionsForSelection\(selectedItem\.productId, selectedItem\.referenceArtworkCompany\)\.find\(/g,
    'const referenceArtwork = selectedItem\n    ? artworks.find('
  );
  
  content = content.replace(
    /const newArtwork = selectedItem\n    \? getArtworkVersionsForSelection\(selectedItem\.productId, selectedItem\.newArtworkCompany\)\.find\(/g,
    'const newArtwork = selectedItem\n    ? artworks.find('
  );

  fs.writeFileSync('src/pages/ApprovalsPage.tsx', content);
}

fixQAPage();
fixApprovalsPage();
