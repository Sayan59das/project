const fs = require('fs');

function fixSelectLabelCard() {
  let content = fs.readFileSync('src/components/labelComparison/SelectLabelCard.tsx', 'utf8');

  // Add import
  if (!content.includes('useMasterData')) {
    content = content.replace(
      "import { formatDateTime } from '../../utils/dateFormat';",
      "import { formatDateTime } from '../../utils/dateFormat';\nimport { useMasterData } from '../../hooks/useMasterData';"
    );
  }

  // Insert hook and replace getSelectableLabels usage with products
  content = content.replace(
    /const labels = useMemo\(\(\) => getSelectableLabels\(\), \[\]\);/,
    'const { products } = useMasterData();\n  const labels = products;' // getSelectableLabels just returns all products according to previous logs
  );

  // Fix handleSelect to be async for identifyComparisonPlan
  content = content.replace(
    /const handleSelect = \(product: Product \| null\) => \{/,
    'const handleSelect = async (product: Product | null) => {'
  );
  content = content.replace(
    /setPlan\(product \? identifyComparisonPlan\(product\.id\) \?\? null : null\);/,
    'setPlan(product ? await identifyComparisonPlan(product.id) ?? null : null);'
  );

  fs.writeFileSync('src/components/labelComparison/SelectLabelCard.tsx', content);
}

fixSelectLabelCard();
