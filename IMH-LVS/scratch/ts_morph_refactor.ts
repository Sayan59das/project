import { Project, SyntaxKind, FunctionDeclaration, Node } from 'ts-morph';
import path from 'path';

// Create a new ts-morph Project
const project = new Project({
  tsConfigFilePath: path.join(import.meta.dirname, '../tsconfig.json'),
});

const filePath = path.join(import.meta.dirname, '../src/services/comparisonService.ts');
const sourceFile = project.getSourceFile(filePath);

if (!sourceFile) {
  console.error("Could not find comparisonService.ts");
  process.exit(1);
}

// 1. Add apiClient import if it doesn't exist
const hasApiClient = sourceFile.getImportDeclaration(decl => decl.getModuleSpecifierValue() === './apiClient');
if (!hasApiClient) {
  sourceFile.addImportDeclaration({
    defaultImport: 'apiClient',
    moduleSpecifier: './apiClient'
  });
}

// Helper to make a function async and return Promise<T>
function makeAsync(func: FunctionDeclaration) {
  if (!func.isAsync()) {
    func.setIsAsync(true);
    const returnTypeNode = func.getReturnTypeNode();
    const returnTypeStr = returnTypeNode ? returnTypeNode.getText() : 'void';
    
    if (!returnTypeStr.startsWith('Promise<')) {
      // If it's already a Promise, don't wrap it again (though ts-morph's isAsync check usually catches this)
      func.setReturnType(`Promise<${returnTypeStr}>`);
    }
  }
}

// Make specific inner functions async
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
    // No-op. Updates should happen directly via PUT / POST.
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

// Helper to transform calls to async functions
const funcsToAwait = [
  'readAll', 'writeAll', 'readCustomLabelAttributes', 'writeCustomLabelAttributes',
  'getProducts', 'getArtworks', 'getLatestApprovedArtworkFromArtworkService',
  'updateArtworkStatus'
];

// Add internal functions that become async
const allFunctions = sourceFile.getFunctions();
const exportedFunctions = allFunctions.filter(f => f.isExported());
exportedFunctions.forEach(f => {
  const name = f.getName();
  if (name && !funcsToAwait.includes(name)) {
    funcsToAwait.push(name);
  }
});

function addAwaitToCalls(node: Node) {
  if (Node.isCallExpression(node)) {
    const expr = node.getExpression();
    if (Node.isIdentifier(expr)) {
      const name = expr.getText();
      if (funcsToAwait.includes(name)) {
        // If it's not already awaited
        const parent = node.getParent();
        if (!Node.isAwaitExpression(parent)) {
          node.replaceWithText(`await ${node.getText()}`);
        }
      }
    }
  }

  node.forEachChild(addAwaitToCalls);
}

// Make all exported functions async and inject 'await' where needed
for (const func of allFunctions) {
  // If the function calls any of our target async functions, it needs to be async
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
    // Recursively add 'await' to specific calls
    func.forEachChild(addAwaitToCalls);
  }
}

// Custom manual fixups for where 'await' was added in a way that breaks Array methods
// e.g., `(await getProducts()).filter(...)` instead of `await getProducts().filter(...)`
function fixArrayMethodAwaits(func: FunctionDeclaration) {
  // We'll just do a string replacement on the body text since AST replacement for this is complex
  let bodyText = func.getBodyText() || '';
  
  const badPatterns = [
    { from: /await readAll\(\)\./g, to: '(await readAll()).' },
    { from: /await getProducts\(\)\./g, to: '(await getProducts()).' },
    { from: /await getArtworks\(\)\./g, to: '(await getArtworks()).' },
    { from: /await readCustomLabelAttributes\(\)\./g, to: '(await readCustomLabelAttributes()).' },
    { from: /await getAllWorkflowHistory\(\)\./g, to: '(await getAllWorkflowHistory()).' },
  ];

  for (const pattern of badPatterns) {
    bodyText = bodyText.replace(pattern.from, pattern.to);
  }
  
  // Fix transitionComparison call which might be `await transitionComparison(...)` inside `return await transitionComparison(...)`
  // Actually string replace is fine.
  bodyText = bodyText.replace(/await await/g, 'await');
  
  func.setBodyText(bodyText);
}

for (const func of allFunctions) {
  if (func.isAsync()) {
    fixArrayMethodAwaits(func);
  }
}

// Some specific fixes:
// saveLabelAttributes should post
const saveAttrFunc = sourceFile.getFunction('saveLabelAttributes');
if (saveAttrFunc) {
  saveAttrFunc.setBodyText(`
    await apiClient.post('/data/LabelAttribute', attributes);
  `);
}

// generateComparisonResult should POST new comparison instead of writeAll
const genCompFunc = sourceFile.getFunction('generateComparisonResult');
if (genCompFunc) {
  let bodyText = genCompFunc.getBodyText() || '';
  bodyText = bodyText.replace(
    /const comparisons = \(await readAll\(\)\);[\s\S]*?await writeAll\(comparisons\);/m,
    `await apiClient.post('/data/Comparison', newComparison);`
  );
  genCompFunc.setBodyText(bodyText);
}

// transitionComparison should PUT updated comparison instead of writeAll
const transCompFunc = sourceFile.getFunction('transitionComparison');
if (transCompFunc) {
  let bodyText = transCompFunc.getBodyText() || '';
  bodyText = bodyText.replace(
    /comparisons\[index\] = updated;\n\s*await writeAll\(comparisons\);/m,
    `await apiClient.put(\`/data/Comparison/\${updated.id}\`, updated);`
  );
  transCompFunc.setBodyText(bodyText);
}

// assignApprovalStage should PUT updated comparison instead of writeAll
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
