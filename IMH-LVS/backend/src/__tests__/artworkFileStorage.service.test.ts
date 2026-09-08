// Unit tests for artworkFileStorage.service.ts — pure disk I/O with no
// database involved, so unlike artworks.file.test.ts (the HTTP-level suite)
// these never skip for a missing DATABASE_URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artworkFilePath, storeArtworkFile, ARTWORK_FILES_DIR } from '../services/artworkFileStorage.service';

function tempFileWith(contents: string): string {
  const file = path.join(os.tmpdir(), `artwork-file-storage-test-${Date.now()}-${Math.random()}.tmp`);
  fs.writeFileSync(file, contents);
  return file;
}

test('artworkFilePath maps a PDF artwork to a .pdf path inside ARTWORK_FILES_DIR', () => {
  const resolved = artworkFilePath('ART-TEST-0001', 'application/pdf');
  assert.equal(resolved, path.join(ARTWORK_FILES_DIR, 'ART-TEST-0001.pdf'));
});

test('artworkFilePath maps both jpeg mime spellings to the same .jpg path', () => {
  assert.equal(artworkFilePath('ART-TEST-0002', 'image/jpeg'), path.join(ARTWORK_FILES_DIR, 'ART-TEST-0002.jpg'));
  assert.equal(artworkFilePath('ART-TEST-0002', 'image/jpg'), path.join(ARTWORK_FILES_DIR, 'ART-TEST-0002.jpg'));
});

test('artworkFilePath refuses a mime type outside the label upload allow-list', () => {
  assert.throws(() => artworkFilePath('ART-TEST-0003', 'application/zip'), /No stored-file extension mapped/);
});

test('storeArtworkFile copies the temp upload bytes to the deterministic destination and reports a real sha256', async (t) => {
  const source = tempFileWith('hello label bytes');
  t.after(() => {
    fs.rmSync(source, { force: true });
    fs.rmSync(artworkFilePath('ART-TEST-0004', 'application/pdf'), { force: true });
  });

  const { storageKey, checksumSha256 } = await storeArtworkFile('ART-TEST-0004', source, 'application/pdf');

  assert.equal(storageKey, 'ART-TEST-0004');
  assert.equal(checksumSha256, crypto.createHash('sha256').update('hello label bytes').digest('hex'));

  const destination = artworkFilePath('ART-TEST-0004', 'application/pdf');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'hello label bytes');
  // The temp source is left in place — the caller (artworks.routes.ts) owns
  // deleting it, matching every other upload route's own cleanup.
  assert.equal(fs.existsSync(source), true);
});

test('storeArtworkFile never leaves a partially-copied file for an unsupported mime type', async (t) => {
  const source = tempFileWith('irrelevant');
  t.after(() => fs.rmSync(source, { force: true }));

  await assert.rejects(() => storeArtworkFile('ART-TEST-0005', source, 'application/zip'), /No stored-file extension mapped/);
});
