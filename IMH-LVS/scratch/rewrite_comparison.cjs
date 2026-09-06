const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/comparisonService.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Import apiClient
if (!code.includes("import apiClient from './apiClient';")) {
  code = code.replace(
    "import { getProducts } from './productService';",
    "import { getProducts } from './productService';\nimport apiClient from './apiClient';"
  );
}

// 2. Change readAll/writeAll to async implementations
code = code.replace(
  /function readAll\(\): Comparison\[\] \{[\s\S]*?return SEED_COMPARISONS;\n  \}\n\}/,
  `async function readAll(): Promise<Comparison[]> {
  try {
    const { data } = await apiClient.get('/data/Comparison');
    return data;
  } catch (err) {
    return SEED_COMPARISONS;
  }
}`
);

code = code.replace(
  /function writeAll\(comparisons: Comparison\[\]\) \{[\s\S]*?\}/,
  `async function writeAll(comparisons: Comparison[]) {
  // Instead of rewriting all, in a real DB we update one by one.
  // For the sake of refactoring with minimal changes, we'll assume we don't use writeAll anymore,
  // or we just mock it for now since we'll refactor the update methods to use PUT.
}`
);

code = code.replace(
  /function readCustomLabelAttributes\(\): LabelAttributes\[\] \{[\s\S]*?return \[\];\n  \}\n\}/,
  `async function readCustomLabelAttributes(): Promise<LabelAttributes[]> {
  try {
    const { data } = await apiClient.get('/data/LabelAttribute');
    return data;
  } catch (err) {
    return [];
  }
}`
);

code = code.replace(
  /function writeCustomLabelAttributes\(attributes: LabelAttributes\[\]\) \{[\s\S]*?\}/,
  `async function writeCustomLabelAttributes(attributes: LabelAttributes[]) {
  // no-op, we'll override saveLabelAttributes to do POST
}`
);

// 3. Make all exported functions async and fix their bodies
const asyncReplacements = [
  // Label Attributes
  {
    regex: /export function saveLabelAttributes\(attributes: LabelAttributes\): void \{[\s\S]*?\}/,
    replacement: `export async function saveLabelAttributes(attributes: LabelAttributes): Promise<void> {
  await apiClient.post('/data/LabelAttribute', attributes);
}`
  },
  {
    regex: /export function getLabelAttributes\(artwork: Artwork, product\?: Product\): LabelAttributes \{/,
    replacement: `export async function getLabelAttributes(artwork: Artwork, product?: Product): Promise<LabelAttributes> {`
  },
  {
    regex: /const custom = readCustomLabelAttributes\(\)\.find/,
    replacement: `const customAttrs = await readCustomLabelAttributes();\n  const custom = customAttrs.find`
  },
  
  // Cross company
  {
    regex: /export function getCrossCompanyCandidates\(productId: string\): CrossCompanyCandidate\[\] \{/,
    replacement: `export async function getCrossCompanyCandidates(productId: string): Promise<CrossCompanyCandidate[]> {`
  },
  {
    regex: /const product = getProducts\(\)\.find/,
    replacement: `const allProds = await getProducts();\n  const product = allProds.find`
  },
  {
    regex: /getProducts\(\)\.filter/,
    replacement: `allProds.filter`
  },
  {
    regex: /const latestApproved = getLatestApprovedArtworkFromArtworkService\(otherProduct.id, otherProduct.marketingCompany\);/,
    replacement: `const latestApproved = await getLatestApprovedArtworkFromArtworkService(otherProduct.id, otherProduct.marketingCompany);`
  },

  // getComparisons
  {
    regex: /export function getComparisons\(\): Comparison\[\] \{/,
    replacement: `export async function getComparisons(): Promise<Comparison[]> {`
  },
  {
    regex: /return readAll\(\);/,
    replacement: `return await readAll();`
  },
  {
    regex: /export function getComparisonById\(id: string\): Comparison \| undefined \{/,
    replacement: `export async function getComparisonById(id: string): Promise<Comparison | undefined> {`
  },
  {
    regex: /return readAll\(\)\.find/,
    replacement: `const all = await readAll();\n  return all.find`
  },
  {
    regex: /export function getComparisonsByProduct\(productId: string\): Comparison\[\] \{/,
    replacement: `export async function getComparisonsByProduct(productId: string): Promise<Comparison[]> {`
  },

  // create / generate
  {
    regex: /export function generateComparisonResult\([\s\S]*?\): Comparison \{/,
    replacement: `export async function generateComparisonResult(productId: string, productName: string, stage: ComparisonStage, newArtwork: Artwork, referenceArtwork: Artwork, actor: string): Promise<Comparison> {`
  },
  {
    regex: /const comparisons = readAll\(\);/,
    replacement: `const comparisons = await readAll();`
  },
  {
    regex: /const newLabel = getLabelAttributes\(newArtwork, product\);/,
    replacement: `const product = (await getProducts()).find(p => p.id === productId);\n  const newLabel = await getLabelAttributes(newArtwork, product);`
  },
  {
    regex: /const referenceLabel = getLabelAttributes\(referenceArtwork, product\);/,
    replacement: `const referenceLabel = await getLabelAttributes(referenceArtwork, product);`
  },
  {
    regex: /writeAll\(comparisons\);/,
    replacement: `await apiClient.post('/data/Comparison', newComparison);`
  },

  // transition
  {
    regex: /function transitionComparison\([\s\S]*?\): Comparison \| undefined \{/,
    replacement: `async function transitionComparison(id: string, actor: Actor, expectedRole: RoleId | undefined, stage: WorkflowStage, action: WorkflowAction, newStatus: ComparisonStatus, remarks: string, requiredStatus?: ComparisonStatus): Promise<Comparison | undefined> {`
  },
  {
    regex: /const comparisons = readAll\(\);/,
    replacement: `const comparisons = await readAll();`
  },
  {
    regex: /writeAll\(comparisons\);/,
    replacement: `await apiClient.put(\`/data/Comparison/\${updated.id}\`, updated);`
  },
  {
    regex: /export function sendComparisonForReview/,
    replacement: `export async function sendComparisonForReview`
  },
  {
    regex: /export function technicalVerifyComparison/,
    replacement: `export async function technicalVerifyComparison`
  },
  {
    regex: /export function technicalRejectComparison/,
    replacement: `export async function technicalRejectComparison`
  },
  {
    regex: /export function qaVerifyComparison/,
    replacement: `export async function qaVerifyComparison`
  },
  {
    regex: /export function qaRejectComparison/,
    replacement: `export async function qaRejectComparison`
  },
  {
    regex: /export function managerFinalApprove/,
    replacement: `export async function managerFinalApprove`
  },
  {
    regex: /export function managerReject/,
    replacement: `export async function managerReject`
  },
  {
    regex: /return transitionComparison/,
    replacement: `return await transitionComparison`
  },

  // summary / queue
  {
    regex: /export function getApprovalSummary\(\): ApprovalSummary \{/,
    replacement: `export async function getApprovalSummary(): Promise<ApprovalSummary> {`
  },
  {
    regex: /export function getArtworkVersionsForSelection\(productId: string, marketingCompany: string\): Artwork\[\] \{/,
    replacement: `export async function getArtworkVersionsForSelection(productId: string, marketingCompany: string): Promise<Artwork[]> {`
  },
  {
    regex: /return getArtworks\(\)\.filter/,
    replacement: `const artworks = await getArtworks();\n  return artworks.filter`
  },
  {
    regex: /export function getUnsubmittedComparisons\(\): Comparison\[\] \{/,
    replacement: `export async function getUnsubmittedComparisons(): Promise<Comparison[]> {`
  },
  {
    regex: /export function assignApprovalStage\([\s\S]*?\): Comparison \| undefined \{/,
    replacement: `export async function assignApprovalStage(id: string, stageKey: ApprovalStageKey, userId: string | undefined, actor: Actor): Promise<Comparison | undefined> {`
  },
  {
    regex: /export function getMyPendingWork\(userId: string, role: RoleId\): Comparison\[\] \{/,
    replacement: `export async function getMyPendingWork(userId: string, role: RoleId): Promise<Comparison[]> {`
  },
  {
    regex: /export function getDashboardSummary\(\): DashboardSummary \{/,
    replacement: `export async function getDashboardSummary(): Promise<DashboardSummary> {`
  },
  {
    regex: /const approval = getApprovalSummary\(\);/,
    replacement: `const approval = await getApprovalSummary();`
  },
  {
    regex: /const artworks = getArtworks\(\);/,
    replacement: `const artworks = await getArtworks();`
  },
  {
    regex: /totalProducts: getProducts\(\)\.length,/,
    replacement: `totalProducts: (await getProducts()).length,`
  },
  {
    regex: /export function getAllWorkflowHistory\(\): RecentActivityItem\[\] \{/,
    replacement: `export async function getAllWorkflowHistory(): Promise<RecentActivityItem[]> {`
  },
  {
    regex: /readAll\(\)\.forEach/,
    replacement: `const all = await readAll();\n  all.forEach`
  },
  {
    regex: /export function getRecentActivity\(limit = 10\): RecentActivityItem\[\] \{/,
    replacement: `export async function getRecentActivity(limit = 10): Promise<RecentActivityItem[]> {`
  },
  {
    regex: /return getAllWorkflowHistory\(\)\.slice/,
    replacement: `const all = await getAllWorkflowHistory();\n  return all.slice`
  }
];

for (const rep of asyncReplacements) {
  code = code.replace(new RegExp(rep.regex, 'g'), rep.replacement);
}

fs.writeFileSync(filePath, code);
console.log('Done rewriting comparisonService.ts');
