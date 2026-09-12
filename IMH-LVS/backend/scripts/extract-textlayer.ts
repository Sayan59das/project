// Node CLI for text-layer-only label extraction.
//
// Reads PDF files and extracts label fields using only the PDF's text layer
// (no OCR), outputting a JSON array of records in the evaluation format
// expected by the Python scorer (ai_backend/eval/score.py).
//
// Usage: node -r tsx/cjs scripts/extract-textlayer.ts <pdf> [<pdf>...]
// Output: JSON array to stdout; warnings to stderr.

import fs from 'fs';
import path from 'path';
import { extractLabelFromTextLayerOnly } from '../src/services/labelExtraction.service';

// The delimiter used by labelSemanticExtractor.service to join claims/ingredients.
const CLAIM_DELIMITER = ' | ';
const INGREDIENT_DELIMITER = ','; // comma used to split ingredients in extractIngredients

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
  colour_theme: null;
  logo: null;
  layout: null;
}

// Convert a blank string to null; leave non-blank strings as-is.
function blankToNull(value: string): string | null {
  return value === '' ? null : value;
}

// Parse claims from the delimited string (split on ' | ').
function parseClaims(delimitedClaims: string): string[] {
  if (!delimitedClaims) return [];
  return delimitedClaims.split(CLAIM_DELIMITER).map(c => c.trim()).filter(c => c.length > 0);
}

// Parse ingredients from the delimited string (split on ',').
function parseIngredients(delimitedIngredients: string): string[] {
  if (!delimitedIngredients) return [];
  return delimitedIngredients.split(INGREDIENT_DELIMITER).map(i => i.trim()).filter(i => i.length > 0);
}

// Parse nutrition table from JSON string; return null if blank or invalid.
function parseNutritionTable(jsonString: string): Record<string, string> | null {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch {
    // If the JSON string is invalid, return null (treat as blank).
    return null;
  }
}

// Create an output record from an extraction result, with all null values for a failed extraction.
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
    claims: parseClaims(extractionResult.claims),
    ingredients: parseIngredients(extractionResult.ingredients),
    nutrition_table: parseNutritionTable(extractionResult.nutritionTable),
    colour_theme: null,
    logo: null,
    layout: null
  };
}

// Main CLI logic.
async function main() {
  const pdfPaths = process.argv.slice(2);

  // Exit with code 2 if no PDFs provided (usage error).
  if (pdfPaths.length === 0) {
    console.error('Usage: node -r tsx/cjs scripts/extract-textlayer.ts <pdf> [<pdf>...]');
    process.exit(2);
  }

  const results: OutputRecord[] = [];

  // Suppress console.log output from libraries (e.g., pdfjs warning messages).
  // This prevents library debug/warning output from mixing with JSON output on stdout.
  const originalLog = console.log;
  console.log = () => {};

  try {
    for (const pdfPath of pdfPaths) {
      try {
        // Read the PDF file.
        const pdfBuffer = fs.readFileSync(pdfPath);

        // Extract label fields using text layer only.
        const extractionResult = await extractLabelFromTextLayerOnly(pdfBuffer);

        // Map to output format.
        const record = toOutputRecord(pdfPath, extractionResult);
        results.push(record);
      } catch (error) {
        // Log the error to stderr; produce a record with all nulls/empty arrays.
        console.error(`Warning: failed to extract ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`);

        // Create a record with all null/empty values.
        const nullRecord: OutputRecord = {
          source_file: path.basename(pdfPath),
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
          layout: null
        };

        results.push(nullRecord);
      }
    }
  } finally {
    // Restore console.log before outputting JSON.
    console.log = originalLog;
  }

  // Output the JSON array to stdout (nothing else).
  console.log(JSON.stringify(results, null, 0));
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
