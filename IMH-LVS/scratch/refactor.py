import re

with open('scratch/original.ts', 'r') as f:
    code = f.read()

# 1. Imports
if "import apiClient from './apiClient';" not in code:
    code = code.replace(
        "import { getProducts } from './productService';",
        "import { getProducts } from './productService';\nimport apiClient from './apiClient';"
    )

# 2. replace readAll and writeAll
code = re.sub(
    r"function readAll\(\): Comparison\[\] \{.*?\n\}",
    """async function readAll(): Promise<Comparison[]> {
  try {
    const { data } = await apiClient.get('/data/Comparison');
    return data;
  } catch (err) {
    return SEED_COMPARISONS;
  }
}""",
    code,
    flags=re.DOTALL
)

code = re.sub(
    r"function writeAll\(comparisons: Comparison\[\]\) \{.*?\n\}",
    """async function writeAll(comparisons: Comparison[]) {
  // no-op, use direct put/post
}""",
    code,
    flags=re.DOTALL
)

code = re.sub(
    r"function readCustomLabelAttributes\(\): LabelAttributes\[\] \{.*?\n\}",
    """async function readCustomLabelAttributes(): Promise<LabelAttributes[]> {
  try {
    const { data } = await apiClient.get('/data/LabelAttribute');
    return data;
  } catch (err) {
    return [];
  }
}""",
    code,
    flags=re.DOTALL
)

code = re.sub(
    r"function writeCustomLabelAttributes\(attributes: LabelAttributes\[\]\) \{.*?\n\}",
    """async function writeCustomLabelAttributes(attributes: LabelAttributes[]) {
}""",
    code,
    flags=re.DOTALL
)

# 3. Add async to exported functions and internal functions
sync_funcs = [
    'saveLabelAttributes',
    'getLabelAttributes',
    'getCrossCompanyCandidates',
    'getComparisons',
    'getComparisonById',
    'getComparisonsByProduct',
    'createComparison',
    'generateComparisonResult',
    'transitionComparison',
    'sendComparisonForReview',
    'technicalVerifyComparison',
    'technicalRejectComparison',
    'qaVerifyComparison',
    'qaRejectComparison',
    'managerFinalApprove',
    'managerReject',
    'getApprovalSummary',
    'getArtworkVersionsForSelection',
    'getUnsubmittedComparisons',
    'assignApprovalStage',
    'getMyPendingWork',
    'getDashboardSummary',
    'getAllWorkflowHistory',
    'getRecentActivity'
]

for func in sync_funcs:
    # Match `export function foo` or `function foo`
    code = re.sub(
        rf"(export )?function {func}\(",
        r"\1async function " + func + r"(",
        code
    )

# 4. Add Promise to return types
# Example: `async function getComparisons(): Comparison[]` -> `async function getComparisons(): Promise<Comparison[]>`
def add_promise(m):
    ret = m.group(1)
    if not ret.startswith("Promise<"):
        return f": Promise<{ret}> {{"
    return m.group(0)

code = re.sub(r":\s*([^{]+?)\s*\{", add_promise, code)

# Fix some specifics that the regex messes up
code = code.replace("Promise<Actor> {", "Actor {")
code = code.replace("Promise<void> {", "void {")
code = code.replace("Promise<Comparison | undefined> {", "Comparison | undefined {")

# 5. Insert await for internal calls
def await_calls(m):
    return f"await {m.group(0)}"

awaitable = [
    'readAll()',
    'getProducts()',
    'getArtworks()',
    'readCustomLabelAttributes()',
    'getAllWorkflowHistory()',
    'getApprovalSummary()'
]

for call in awaitable:
    # Insert await only if not already there
    code = re.sub(rf"(?<!await ){re.escape(call)}", f"(await {call})", code)

# Fix API calls for saves
code = re.sub(
    r"writeCustomLabelAttributes\(\[\.\.\.existing, attributes\]\);",
    r"await apiClient.post('/data/LabelAttribute', attributes);",
    code
)

code = re.sub(
    r"writeAll\(comparisons\);",
    r"if (typeof newComparison !== 'undefined') await apiClient.post('/data/Comparison', newComparison); else if (typeof updated !== 'undefined') await apiClient.put(`/data/Comparison/${updated.id}`, updated);",
    code
)

# write out
with open('src/services/comparisonService.ts', 'w') as f:
    f.write(code)

print("Done")
