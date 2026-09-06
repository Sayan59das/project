import { Project, SyntaxKind } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("src/pages/**/*.tsx");
project.addSourceFilesAtPaths("src/components/**/*.tsx");

const filesToUpdate = ['ReportsPage.tsx', 'ArtworkPage.tsx', 'ApprovalsPage.tsx', 'QAPage.tsx', 'SelectLabelCard.tsx'];

for (const sourceFile of project.getSourceFiles()) {
  const baseName = sourceFile.getBaseName();
  if (!filesToUpdate.includes(baseName)) continue;

  console.log(`Processing ${baseName}...`);
  
  // Add useMasterData import
  let hasUseMasterData = sourceFile.getImportDeclarations().some(imp => imp.getModuleSpecifierValue().includes('useMasterData'));
  if (!hasUseMasterData) {
    sourceFile.addImportDeclaration({
      namedImports: ['useMasterData'],
      moduleSpecifier: '../hooks/useMasterData'
    });
  }

  // Common replacements for state hooks initialized with getter functions:
  // e.g. const [brands] = useState<Brand[]>(() => getBrands());
  const useStateCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(c => c.getExpression().getText() === 'useState');
    
  let addedHook = false;
  const functionDec = sourceFile.getFunctions().find(f => f.getName() === baseName.replace('.tsx', ''));
  if (functionDec && !addedHook) {
    functionDec.insertStatements(0, 'const { brands, flavours, marketingCompanies, manufacturingCompanies, products, artworks, comparisons, refetchArtworks, refetchComparisons } = useMasterData();');
    addedHook = true;
  }

  // Remove the old useState calls that used getters
  sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement).forEach(stmt => {
    const text = stmt.getText();
    if (text.includes('useState') && text.includes('(() => get')) {
      stmt.remove();
    }
  });

  // Replace refresh functions
  sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement).forEach(stmt => {
    const text = stmt.getText();
    if (text.includes('const refresh = () => setArtworks')) {
        stmt.replaceWithText('const refresh = refetchArtworks;');
    }
    if (text.includes('const refresh = () => setComparisons')) {
        stmt.replaceWithText('const refresh = refetchComparisons;');
    }
  });

  // ArtworkPage specific:
  if (baseName === 'ArtworkPage.tsx') {
    // replace `getBrands()` with `brands`
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
      const txt = call.getExpression().getText();
      if (['getBrands', 'getFlavours', 'getMarketingCompanies', 'getManufacturingCompanies', 'getProducts', 'getArtworks'].includes(txt)) {
          if (call.getArguments().length === 0) {
              call.replaceWithText(txt.replace('get', '').toLowerCase());
          }
      }
    });
  }

  sourceFile.saveSync();
}
console.log("Done");
