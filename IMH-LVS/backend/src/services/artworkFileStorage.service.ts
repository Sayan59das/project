// Where a durably-stored artwork file actually lives on disk, once uploaded
// via POST /api/artworks/:id/file (see artworks.routes.ts).
//
// Local disk, not S3 — there is no cloud storage credential available in this
// deployment. artworks.storage_key only records a handle (see 001_init.sql's
// own comment: "storage_key is the only handle"), never a filesystem path, so
// swapping this module for an S3 client later needs no schema change and no
// change to mapArtwork's computed URL — only this file's two functions.
//
// One artwork has exactly one durable file (content is immutable once
// uploaded — a corrected label is a new version, i.e. a new artwork row), so
// the artwork's own id is both a sufficient and a stable storage key.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const ARTWORK_FILES_DIR = path.join(__dirname, '..', '..', 'uploads', 'artworks');

if (!fs.existsSync(ARTWORK_FILES_DIR)) {
  fs.mkdirSync(ARTWORK_FILES_DIR, { recursive: true });
}

// Matches upload.middleware.ts's ALLOWED_LABEL_MIME_TYPES — kept as its own
// map rather than derived from that list because the two express different
// things (which types may be uploaded vs. what an already-accepted type's
// file extension is), and an artwork's mime type never changes after it is
// declared at creation, so this only ever sees one of these three values.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg'
};

function extensionFor(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error(`No stored-file extension mapped for mime type "${mimeType}".`);
  return extension;
}

/** Where one artwork's durable file lives on disk, given its recorded mime type. */
export function artworkFilePath(artworkId: string, mimeType: string): string {
  return path.join(ARTWORK_FILES_DIR, `${artworkId}${extensionFor(mimeType)}`);
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Moves an uploaded temp file into durable per-artwork storage and returns
 * the handle + checksum the artworks row records (see setArtworkStorage).
 *
 * copyFile+unlink rather than rename: the temp upload directory
 * (upload.middleware.ts's UPLOAD_DIR) and this one are not guaranteed to be
 * on the same filesystem in every deployment, and rename fails across
 * filesystems where copy does not. The caller (artworks.routes.ts) still owns
 * deleting the temp file afterward, same as every other upload route.
 */
export async function storeArtworkFile(
  artworkId: string,
  tempFilePath: string,
  mimeType: string
): Promise<{ storageKey: string; checksumSha256: string }> {
  const checksumSha256 = await sha256File(tempFilePath);
  await fs.promises.copyFile(tempFilePath, artworkFilePath(artworkId, mimeType));
  return { storageKey: artworkId, checksumSha256 };
}
