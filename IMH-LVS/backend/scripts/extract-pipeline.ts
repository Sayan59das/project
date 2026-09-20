// Node CLI for the FULL label extraction pipeline — text layer, then OCR
// (with outlined-text detection), then Ollama VLM role-resolution for
// whatever is still blank. This is Phase C+D+E combined, as opposed to
// extract-textlayer.ts's text-layer-only path. Outputs the same JSON
// record shape so ai_backend/eval/score.py's --mode pipeline can score it
// with the exact same rules as --mode ai and --mode textlayer.
//
// Requires OLLAMA_URL to be set (e.g. http://127.0.0.1:11434) for the
// role-resolution step to actually run; without it, this still runs
// text-layer + OCR, just without the VLM fallback — never throws either
// way, same philosophy as the rest of this pipeline.
//
// Usage: node -r tsx/cjs scripts/extract-pipeline.ts <pdf> [<pdf>...]
// Output: JSON array to stdout; warnings to stderr.

import fs from 'fs';
import path from 'path';
import { extractLabelReportFromFile } from '../src/services/labelExtraction.service';
import { splitIngredientsList } from '../src/services/labelSemanticExtractor.service';

const COLOUR_DELIMITER = ' & '; // colourTheme.service's own join delimiter

interface OutputRecord {
  source_file: string;
  brand_name: string | null;
  product_name: string | null;
  flavour: string | null;
  fssai_number: string | null;
  marketing_company: string | null;
  address: string | null;
  customer_care_number: string | null;
  customer_care_email: string | null;
  package_size: string | null;
  manufacturing_company: string | null;
  claims: string[];
  ingredients: string[];
  nutrition_table: Record<string, string> | null;
  colour_theme: string[] | null;
  // Neither field exists as a text value anywhere in this pipeline — both
  // are genuinely visual and are compared as images (imageSimilarity
  // .service.ts), never extracted as text. Always null here, same as
  // extract-textlayer.ts; not a gap specific to this script.
  logo: null;
  layout: null;
  // Step 2 (accuracy plan): which pass wrote each non-blank scalar field,
  // keyed the same snake_case way as the field itself (e.g. brand_name),
  // so eval/score.py can join this record's per-field source straight onto
  // its own per-field scoring without a separate name-mapping table. Absent
  // key == blank field, same convention as the rest of this record. Only
  // covers the nine fillBlanks-cascade fields — manufacturing_company is a
  // fixed constant and the list/table fields (claims, ingredients,
  // nutrition_table, colour_theme) have their own, non-cascading extraction
  // paths that fieldMeta doesn't track.
  field_sources: Record<string, string>;
}

// LabelExtractionResult's camelCase field names -> this record's own
// snake_case names, for exactly the nine fields fieldMeta can tag (see
// FieldSource's own doc comment in labelExtraction.service.ts).
const FIELD_META_KEY_MAP: Record<string, string> = {
  marketingCompany: 'marketing_company',
  address: 'address',
  fssaiNumber: 'fssai_number',
  email: 'customer_care_email',
  customerCareNumber: 'customer_care_number',
  brand: 'brand_name',
  flavour: 'flavour',
  productName: 'product_name',
  packageSize: 'package_size'
};

function toFieldSources(fieldMeta: Record<string, { source: string }>): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(fieldMeta)) {
    const snakeKey = FIELD_META_KEY_MAP[key];
    if (snakeKey) sources[snakeKey] = entry.source;
  }
  return sources;
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value;
}

function parseDelimited(value: string, delimiter: string): string[] {
  if (!value) return [];
  return value.split(delimiter).map((v) => v.trim()).filter((v) => v.length > 0);
}

function parseNutritionTable(jsonString: string): Record<string, string> | null {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

// The client's Masters catalogue (accuracy2 plan Step 2) -- a list read at
// runtime from a JSON file (see ai_backend/eval/build_masters.py /
// masters.json), never a string literal here. Unset EVAL_MASTERS_JSON runs
// exactly as before: masters-off, every candidate list empty.
type Masters = { knownClaims: string[]; knownFlavours: string[]; knownBrands: string[] };

function loadMasters(): Masters {
  const jsonPath = process.env.EVAL_MASTERS_JSON;
  if (!jsonPath) return { knownClaims: [], knownFlavours: [], knownBrands: [] };
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return {
    knownClaims: Array.isArray(raw.claims) ? raw.claims : [],
    knownFlavours: Array.isArray(raw.flavours) ? raw.flavours : [],
    knownBrands: Array.isArray(raw.brands) ? raw.brands : []
  };
}

function nullRecordFor(filePath: string): OutputRecord {
  return {
    source_file: path.basename(filePath),
    brand_name: null,
    product_name: null,
    flavour: null,
    fssai_number: null,
    marketing_company: null,
    address: null,
    customer_care_number: null,
    customer_care_email: null,
    package_size: null,
    manufacturing_company: null,
    claims: [],
    ingredients: [],
    nutrition_table: null,
    colour_theme: null,
    logo: null,
    layout: null,
    field_sources: {},
  };
}

function toOutputRecord(
  filePath: string,
  extractionResult: any,
  fieldMeta: Record<string, { source: string }>,
  claimsList: string[]
): OutputRecord {
  return {
    source_file: path.basename(filePath),
    brand_name: blankToNull(extractionResult.brand),
    product_name: blankToNull(extractionResult.productName),
    flavour: blankToNull(extractionResult.flavour),
    fssai_number: blankToNull(extractionResult.fssaiNumber),
    marketing_company: blankToNull(extractionResult.marketingCompany),
    address: blankToNull(extractionResult.address),
    customer_care_number: blankToNull(extractionResult.customerCareNumber),
    customer_care_email: blankToNull(extractionResult.email),
    package_size: blankToNull(extractionResult.packageSize),
    manufacturing_company: blankToNull(extractionResult.manufacturingCompany),
    // accuracy3 Step 3: claimsList (a real array from the report object),
    // not parseDelimited(extractionResult.claims, CLAIM_DELIMITER) --
    // splitting the ' | '-joined STRING back apart shatters a combined
    // badge whose own text contains that same delimiter (e.g. "Free From
    // Gluten | Milk | Soy") into meaningless fragments. See
    // ClaimsResult.claimsList's own doc comment (labelSemanticExtractor
    // .service.ts) for the full history.
    claims: claimsList,
    ingredients: splitIngredientsList(extractionResult.ingredients),
    nutrition_table: parseNutritionTable(extractionResult.nutritionTable),
    colour_theme: extractionResult.colourTheme ? parseDelimited(extractionResult.colourTheme, COLOUR_DELIMITER) : null,
    logo: null,
    layout: null,
    field_sources: toFieldSources(fieldMeta),
  };
}

async function main() {
  const pdfPaths = process.argv.slice(2);
  if (pdfPaths.length === 0) {
    console.error('Usage: node -r tsx/cjs scripts/extract-pipeline.ts <pdf> [<pdf>...]');
    process.exit(2);
  }

  const results: OutputRecord[] = [];
  const masters = loadMasters();

  // Suppress console.log so library/debug output never mixes with the JSON
  // on stdout (console.warn/error still go to stderr, unaffected).
  const originalLog = console.log;
  console.log = () => {};

  try {
    for (const pdfPath of pdfPaths) {
      try {
        const report = await extractLabelReportFromFile(
          pdfPath,
          'application/pdf',
          masters.knownClaims,
          masters.knownFlavours,
          masters.knownBrands
        );
        results.push(toOutputRecord(pdfPath, report.result, report.fieldMeta, report.claimsList));
      } catch (error) {
        console.error(`Warning: failed to extract ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`);
        results.push(nullRecordFor(pdfPath));
      }
    }
  } finally {
    console.log = originalLog;
  }

  console.log(JSON.stringify(results, null, 0));
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
