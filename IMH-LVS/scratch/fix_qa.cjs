const fs = require('fs');

function fixQAPage() {
  let content = fs.readFileSync('src/pages/QAPage.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { formatDateTime } from '../utils/dateFormat';",
      "import { formatDateTime } from '../utils/dateFormat';\nimport { useMasterData } from '../hooks/useMasterData';"
    );
  }
  
  // Replace getComparisons
  content = content.replace(
    /const \[comparisons, setComparisons\] = useState<Comparison\[\]>\(\(\) => getComparisons\(\)\);/,
    'const { artworks, comparisons, refetchComparisons: refresh } = useMasterData();'
  );
  content = content.replace(
    /const refresh = \(\) => setComparisons\(getComparisons\(\)\);/,
    ''
  );

  // Replace getArtworkVersionsForSelection
  content = content.replace(
    /getArtworkVersionsForSelection\(selectedItem\.productId, selectedItem\.referenceArtworkCompany\)/g,
    'artworks'
  );
  content = content.replace(
    /getArtworkVersionsForSelection\(selectedItem\.productId, selectedItem\.newArtworkCompany\)/g,
    'artworks'
  );

  fs.writeFileSync('src/pages/QAPage.tsx', content);
}

fixQAPage();
