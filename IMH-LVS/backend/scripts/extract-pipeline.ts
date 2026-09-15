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
import { extractLabelFromFile } from '../src/services/labelExtraction.service';

// The delimiter used by labelSemanticExtractor.service to join claims/ingredients.
const CLAIM_DELIMITER = ' | ';
const INGREDIENT_DELIMITER = ',';
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
  };
}

function toOutputRecord(filePath: string, extractionResult: any): OutputRecord {
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
    claims: parseDelimited(extractionResult.claims, CLAIM_DELIMITER),
    ingredients: parseDelimited(extractionResult.ingredients, INGREDIENT_DELIMITER),
    nutrition_table: parseNutritionTable(extractionResult.nutritionTable),
    colour_theme: extractionResult.colourTheme ? parseDelimited(extractionResult.colourTheme, COLOUR_DELIMITER) : null,
    logo: null,
    layout: null,
  };
}

async function main() {
  const pdfPaths = process.argv.slice(2);
  if (pdfPaths.length === 0) {
    console.error('Usage: node -r tsx/cjs scripts/extract-pipeline.ts <pdf> [<pdf>...]');
    process.exit(2);
  }

  const results: OutputRecord[] = [];

  // Suppress console.log so library/debug output never mixes with the JSON
  // on stdout (console.warn/error still go to stderr, unaffected).
  const originalLog = console.log;
  console.log = () => {};

  try {
    for (const pdfPath of pdfPaths) {
      try {
        const extractionResult = await extractLabelFromFile(pdfPath, 'application/pdf');
        results.push(toOutputRecord(pdfPath, extractionResult));
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
