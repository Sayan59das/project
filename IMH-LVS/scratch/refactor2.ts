import { Project, SyntaxKind } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("src/pages/**/*.tsx");
project.addSourceFilesAtPaths("src/components/**/*.tsx");

const filesToUpdate = ['ReportsPage.tsx', 'ArtworkPage.tsx', 'ApprovalsPage.tsx', 'QAPage.tsx', 'SelectLabelCard.tsx'];

for (const sourceFile of project.getSourceFiles()) {
  const baseName = sourceFile.getBaseName();
  if (!filesToUpdate.includes(baseName)) continue;

  console.log(`Processing ${baseName}...`);
  
  // replace `getBrands()` with `brands`
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
    const txt = call.getExpression().getText();
    if (['getBrands', 'getFlavours', 'getMarketingCompanies', 'getManufacturingCompanies', 'getProducts', 'getArtworks', 'getComparisons'].includes(txt)) {
        if (call.getArguments().length === 0) {
            call.replaceWithText(txt.replace('get', '').charAt(0).toLowerCase() + txt.replace('get', '').slice(1));
        }
    }
  });

  // Specifically for QAPage, the array for comparisons must be filtered
  // Actually, we replaced getComparisons() with comparisons!

  sourceFile.saveSync();
}
console.log("Done");
