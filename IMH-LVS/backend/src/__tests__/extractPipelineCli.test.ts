// Tests for scripts/extract-pipeline.ts CLI — the full text-layer+OCR+VLM
// pipeline's evaluation entry point (as opposed to extract-textlayer.ts's
// text-layer-only path). Structural/contract tests only: does it produce
// the JSON shape ai_backend/eval/score.py expects, and does it stay
// resilient to a bad file — not whether any particular field comes back
// correct, which is score.py's job to measure against real ground truth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const fixturesDir = path.join(__dirname, 'fixtures');

function runCli(pdfPaths: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['-r', 'tsx/cjs', 'scripts/extract-pipeline.ts', ...pdfPaths], {
      cwd: path.join(__dirname, '../../'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (data) => (stdout += data.toString()));
    child.stderr!.on('data', (data) => (stderr += data.toString()));
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code }));
  });
}

test('CLI with no arguments exits with a usage error, code 2', async () => {
  const { exitCode, stderr } = await runCli([]);
  assert.equal(exitCode, 2);
  assert.match(stderr, /Usage:/);
});

test('a corrupt PDF produces a null record instead of crashing the whole run', { timeout: 60_000 }, async () => {
  const { stdout, exitCode } = await runCli([path.join(fixturesDir, 'corrupt.pdf')]);
  assert.equal(exitCode, 0);
  const records = JSON.parse(stdout);
  assert.equal(records.length, 1);
  assert.equal(records[0].source_file, 'corrupt.pdf');
  assert.equal(records[0].brand_name, null);
  assert.deepEqual(records[0].claims, []);
});

test('every record has the full field set score.py expects, in argument order', { timeout: 120_000 }, async () => {
  const pdfPaths = [path.join(fixturesDir, 'she-arise-gummies.pdf'), path.join(fixturesDir, 'corrupt.pdf')];
  const { stdout, exitCode } = await runCli(pdfPaths);
  assert.equal(exitCode, 0);

  const records = JSON.parse(stdout);
  assert.equal(records.length, 2);
  assert.equal(records[0].source_file, 'she-arise-gummies.pdf');
  assert.equal(records[1].source_file, 'corrupt.pdf');

  const expectedKeys = [
    'source_file', 'brand_name', 'product_name', 'flavour', 'fssai_number', 'marketing_company',
    'address', 'customer_care_number', 'customer_care_email', 'package_size', 'manufacturing_company',
    'claims', 'ingredients', 'nutrition_table', 'colour_theme', 'logo', 'layout',
  ];
  for (const record of records) {
    assert.deepEqual(Object.keys(record).sort(), [...expectedKeys].sort());
    assert.equal(record.logo, null, 'logo is never a text value in this pipeline — always null');
    assert.equal(record.layout, null, 'layout is never a text value in this pipeline — always null');
  }
});

test('stdout is nothing but the JSON array — no library log noise mixed in', { timeout: 60_000 }, async () => {
  const { stdout, exitCode } = await runCli([path.join(fixturesDir, 'corrupt.pdf')]);
  assert.equal(exitCode, 0);
  assert.doesNotThrow(() => JSON.parse(stdout), `stdout was not clean JSON: ${stdout.slice(0, 200)}`);
});
