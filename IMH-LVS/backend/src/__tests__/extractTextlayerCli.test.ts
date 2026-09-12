// Tests for scripts/extract-textlayer.ts CLI.
//
// Spawns the CLI as a child process and verifies the JSON output contract:
// an array of label extraction records mapped to the evaluation format,
// with claims/ingredients split from their delimited strings, and
// nutrition_table parsed from JSON or nullified when blank.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const fixturesDir = path.join(__dirname, 'fixtures');

// Helper to run the CLI and capture stdout/stderr.
function runCli(pdfPaths: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['-r', 'tsx/cjs', 'scripts/extract-textlayer.ts', ...pdfPaths], {
      cwd: path.join(__dirname, '../../'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout!.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr!.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

test('CLI with two PDFs produces a JSON array of extraction records in argument order', async () => {
  const pdfPaths = [
    path.join(fixturesDir, 'she-arise-gummies.pdf'),
    path.join(fixturesDir, 'corrupt.pdf')
  ];

  const { stdout, exitCode } = await runCli(pdfPaths);

  assert.equal(exitCode, 0, 'CLI should exit with code 0');

  const records = JSON.parse(stdout);
  assert(Array.isArray(records), 'stdout should contain a JSON array');
  assert.equal(records.length, 2, 'should have one record per input PDF');

  // Verify the first record is from the first PDF.
  assert.equal(records[0].source_file, 'she-arise-gummies.pdf');
  // Verify the second record is from the second PDF.
  assert.equal(records[1].source_file, 'corrupt.pdf');
});

test('each record contains all contract fields', async () => {
  const pdfPath = path.join(fixturesDir, 'she-arise-gummies.pdf');
  const { stdout } = await runCli([pdfPath]);

  const records = JSON.parse(stdout);
  const record = records[0];

  const expectedFields = [
    'source_file',
    'brand_name', 'product_name', 'flavour', 'fssai_number', 'marketing_company',
    'address', 'customer_care_number', 'customer_care_email', 'package_size',
    'manufacturing_company', 'claims', 'ingredients', 'nutrition_table',
    'colour_theme', 'logo', 'layout'
  ];

  for (const field of expectedFields) {
    assert(field in record, `field '${field}' should be present`);
  }
});

test('claims and ingredients are arrays (split from delimited strings)', async () => {
  const pdfPath = path.join(fixturesDir, 'she-arise-gummies.pdf');
  const { stdout } = await runCli([pdfPath]);

  const records = JSON.parse(stdout);
  const record = records[0];

  assert(Array.isArray(record.claims), 'claims should be an array');
  assert(Array.isArray(record.ingredients), 'ingredients should be an array');
});

test('nutrition_table is an object or null', async () => {
  const pdfPath = path.join(fixturesDir, 'she-arise-gummies.pdf');
  const { stdout } = await runCli([pdfPath]);

  const records = JSON.parse(stdout);
  const record = records[0];

  assert(record.nutrition_table === null || typeof record.nutrition_table === 'object',
    'nutrition_table should be null or an object');
});

test('corrupt PDF produces a record with null scalars and empty arrays', async () => {
  const pdfPath = path.join(fixturesDir, 'corrupt.pdf');
  const { stdout, exitCode } = await runCli([pdfPath]);

  assert.equal(exitCode, 0, 'process should still exit 0 for corrupt PDF');

  const records = JSON.parse(stdout);
  const record = records[0];

  // Verify source_file is set (basename).
  assert.equal(record.source_file, 'corrupt.pdf');

  // Every scalar should be null (except manufacturing_company which is always set to a fixed constant).
  assert.equal(record.brand_name, null);
  assert.equal(record.product_name, null);
  assert.equal(record.flavour, null);
  assert.equal(record.fssai_number, null);
  assert.equal(record.marketing_company, null);
  assert.equal(record.address, null);
  assert.equal(record.customer_care_number, null);
  assert.equal(record.customer_care_email, null);
  assert.equal(record.package_size, null);
  // manufacturing_company is always set to FIXED_MANUFACTURING_COMPANY, never null
  assert(typeof record.manufacturing_company === 'string', 'manufacturing_company should be set to a fixed constant');
  assert.equal(record.colour_theme, null);
  assert.equal(record.logo, null);
  assert.equal(record.layout, null);

  // Arrays should be empty.
  assert.deepEqual(record.claims, []);
  assert.deepEqual(record.ingredients, []);

  // nutrition_table should be null.
  assert.equal(record.nutrition_table, null);
});

test('non-existent PDF path produces a null record with source_file set', async () => {
  const pdfPath = path.join(__dirname, 'fixtures', 'does-not-exist.pdf');
  const { stdout, exitCode } = await runCli([pdfPath]);

  assert.equal(exitCode, 0, 'process should still exit 0 for non-existent PDF');

  const records = JSON.parse(stdout);
  assert(Array.isArray(records), 'stdout should contain a JSON array');
  assert.equal(records.length, 1, 'should have one record for the input PDF');

  const record = records[0];

  // Verify source_file is set (basename).
  assert.equal(record.source_file, 'does-not-exist.pdf');

  // Every scalar should be null.
  assert.equal(record.brand_name, null);
  assert.equal(record.product_name, null);
  assert.equal(record.flavour, null);
  assert.equal(record.fssai_number, null);
  assert.equal(record.marketing_company, null);
  assert.equal(record.address, null);
  assert.equal(record.customer_care_number, null);
  assert.equal(record.customer_care_email, null);
  assert.equal(record.package_size, null);
  assert.equal(record.manufacturing_company, null);
  assert.equal(record.colour_theme, null);
  assert.equal(record.logo, null);
  assert.equal(record.layout, null);

  // Arrays should be empty.
  assert.deepEqual(record.claims, []);
  assert.deepEqual(record.ingredients, []);

  // nutrition_table should be null.
  assert.equal(record.nutrition_table, null);
});

test('CLI with no arguments exits with code 2 (usage error)', async () => {
  const { exitCode } = await runCli([]);

  assert.equal(exitCode, 2, 'should exit with code 2 when no PDFs provided');
});
