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
    # Match `export function foo` or `function foo` and capture the signature
    def replace_func(m):
        prefix = m.group(1) or ""
        sig = m.group(2)
        # Check if return type is present
        if "): " in sig:
            # Add Promise<...> around the return type
            parts = sig.rsplit("): ", 1)
            ret_type = parts[1]
            if not ret_type.startswith("Promise<"):
                sig = f"{parts[0]}): Promise<{ret_type}>"
        return f"{prefix}async function {func}({sig} {{"
    
    # We match `function name(args): type {`
    code = re.sub(
        rf"(export )?function {func}\(([^{{]*?)\)\s*(:\s*[^{{]*?)?\s*{{",
        lambda m: f"{m.group(1) or ''}async function {func}({m.group(2)}){': Promise<' + m.group(3)[1:].strip() + '>' if m.group(3) and not m.group(3).strip().startswith(': Promise<') else ''} {{",
        code
    )

# Fix API calls for saves BEFORE inserting general awaits
code = re.sub(
    r"writeCustomLabelAttributes\(\[\.\.\.existing, attributes\]\);",
    r"await apiClient.post('/data/LabelAttribute', attributes);",
    code
)

code = re.sub(
    r"writeAll\(comparisons\);",
    r"if (typeof newComparison !== 'undefined') { await apiClient.post('/data/Comparison', newComparison); } else if (typeof updated !== 'undefined') { await apiClient.put(`/data/Comparison/${updated.id}`, updated); }",
    code
)


# 5. Insert await for internal calls
awaitable = [
    'readAll()',
    'getProducts()',
    'getArtworks()',
    'readCustomLabelAttributes()',
    'getAllWorkflowHistory()',
    'getApprovalSummary()',
    'getLatestApprovedArtworkFromArtworkService' # This one takes arguments, handled below
]

for call in awaitable:
    # Insert await only if not already there and if the preceding token is not `await` or `function` (in signature)
    code = re.sub(rf"(?<!await )(?<!function ){re.escape(call)}", f"(await {call})", code)

# Handle getLatestApprovedArtworkFromArtworkService calls
code = re.sub(
    r"(?<!await )(getLatestApprovedArtworkFromArtworkService\([^)]+\))",
    r"(await \1)",
    code
)

# Replace 'await await' in case of double awaits
code = code.replace("await (await", "(await")

with open('src/services/comparisonService.ts', 'w') as f:
    f.write(code)

print("Done")
