const { Project, SyntaxKind, Node } = require('ts-morph');
const path = require('path');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const filePath = path.join(__dirname, '../src/services/comparisonService.ts');
const sourceFile = project.getSourceFile(filePath);

if (!sourceFile) {
  console.error("Could not find comparisonService.ts");
  process.exit(1);
}

// 1. Add apiClient import
const hasApiClient = sourceFile.getImportDeclaration(decl => decl.getModuleSpecifierValue() === './apiClient');
if (!hasApiClient) {
  sourceFile.addImportDeclaration({
    defaultImport: 'apiClient',
    moduleSpecifier: './apiClient'
  });
}

function makeAsync(func) {
  if (!func.isAsync()) {
    func.setIsAsync(true);
    const returnTypeNode = func.getReturnTypeNode();
    const returnTypeStr = returnTypeNode ? returnTypeNode.getText() : 'void';
    
    if (!returnTypeStr.startsWith('Promise<')) {
      func.setReturnType(`Promise<${returnTypeStr}>`);
    }
  }
}

const readAllFunc = sourceFile.getFunction('readAll');
if (readAllFunc) {
  makeAsync(readAllFunc);
  readAllFunc.setBodyText(`
    try {
      const { data } = await apiClient.get('/data/Comparison');
      return data;
    } catch (err) {
      return SEED_COMPARISONS;
    }
  `);
}

const writeAllFunc = sourceFile.getFunction('writeAll');
if (writeAllFunc) {
  makeAsync(writeAllFunc);
  writeAllFunc.setBodyText(`
    // No-op
  `);
}

const readCustomFunc = sourceFile.getFunction('readCustomLabelAttributes');
if (readCustomFunc) {
  makeAsync(readCustomFunc);
  readCustomFunc.setBodyText(`
    try {
      const { data } = await apiClient.get('/data/LabelAttribute');
      return data;
    } catch (err) {
      return [];
    }
  `);
}

const writeCustomFunc = sourceFile.getFunction('writeCustomLabelAttributes');
if (writeCustomFunc) {
  makeAsync(writeCustomFunc);
  writeCustomFunc.setBodyText(`
    // No-op.
  `);
}

const funcsToAwait = [
  'readAll', 'writeAll', 'readCustomLabelAttributes', 'writeCustomLabelAttributes',
  'getProducts', 'getArtworks', 'getLatestApprovedArtworkFromArtworkService',
  'updateArtworkStatus'
];

const allFunctions = sourceFile.getFunctions();
const exportedFunctions = allFunctions.filter(f => f.isExported());
exportedFunctions.forEach(f => {
  const name = f.getName();
  if (name && !funcsToAwait.includes(name)) {
    funcsToAwait.push(name);
  }
});

function addAwaitToCalls(node) {
  if (Node.isCallExpression(node)) {
    const expr = node.getExpression();
    if (Node.isIdentifier(expr)) {
      const name = expr.getText();
      if (funcsToAwait.includes(name)) {
        const parent = node.getParent();
        if (!Node.isAwaitExpression(parent)) {
          node.replaceWithText(`await ${node.getText()}`);
        }
      }
    }
  }

  node.forEachChild(addAwaitToCalls);
}

for (const func of allFunctions) {
  let needsAsync = false;
  func.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isIdentifier(expr) && funcsToAwait.includes(expr.getText())) {
        needsAsync = true;
      }
    }
  });

  if (needsAsync || func.isExported()) {
    makeAsync(func);
    func.forEachChild(addAwaitToCalls);
  }
}

// Custom text replacements for array methods
function fixArrayMethodAwaits(func) {
  let bodyText = func.getBodyText() || '';
  
  const badPatterns = [
    { from: /await readAll\(\)\./g, to: '(await readAll()).' },
    { from: /await getProducts\(\)\./g, to: '(await getProducts()).' },
    { from: /await getArtworks\(\)\./g, to: '(await getArtworks()).' },
    { from: /await readCustomLabelAttributes\(\)\./g, to: '(await readCustomLabelAttributes()).' },
    { from: /await getAllWorkflowHistory\(\)\./g, to: '(await getAllWorkflowHistory()).' },
    { from: /await await/g, to: 'await' }
  ];

  for (const pattern of badPatterns) {
    bodyText = bodyText.replace(pattern.from, pattern.to);
  }
  
  func.setBodyText(bodyText);
}

for (const func of allFunctions) {
  if (func.isAsync()) {
    fixArrayMethodAwaits(func);
  }
}

const saveAttrFunc = sourceFile.getFunction('saveLabelAttributes');
if (saveAttrFunc) {
  saveAttrFunc.setBodyText(`
    await apiClient.post('/data/LabelAttribute', attributes);
  `);
}

const genCompFunc = sourceFile.getFunction('generateComparisonResult');
if (genCompFunc) {
  let bodyText = genCompFunc.getBodyText() || '';
  bodyText = bodyText.replace(
    /const comparisons = \(await readAll\(\)\);[\s\S]*?await writeAll\(comparisons\);/m,
    `await apiClient.post('/data/Comparison', newComparison);`
  );
  genCompFunc.setBodyText(bodyText);
}

const transCompFunc = sourceFile.getFunction('transitionComparison');
if (transCompFunc) {
  let bodyText = transCompFunc.getBodyText() || '';
  bodyText = bodyText.replace(
    /comparisons\[index\] = updated;\n\s*await writeAll\(comparisons\);/m,
    `await apiClient.put(\`/data/Comparison/\${updated.id}\`, updated);`
  );
  transCompFunc.setBodyText(bodyText);
}

const assignAppFunc = sourceFile.getFunction('assignApprovalStage');
if (assignAppFunc) {
  let bodyText = assignAppFunc.getBodyText() || '';
  bodyText = bodyText.replace(
    /comparisons\[index\] = updated;\n\s*await writeAll\(comparisons\);/m,
    `await apiClient.put(\`/data/Comparison/\${updated.id}\`, updated);`
  );
  assignAppFunc.setBodyText(bodyText);
}

project.saveSync();
console.log("Transformation complete.");
