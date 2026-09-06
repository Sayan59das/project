// Integration tests for the Postgres layer: the repositories against a real
// database, plus the schema guarantees migration 001 claims in its comments.
//
// These need a live Postgres, so they SKIP when DATABASE_URL is unset — the
// same rule pool.ts follows, and what keeps the OCR half of this service
// testable on a machine with no database (see src/db/pool.ts's header). When
// it IS set, the database is expected to be migrated and seeded; the setup
// hook says so rather than letting a dozen assertions fail one by one.
//
// Nothing here leaves a trace. Every write runs inside a transaction that is
// rolled back whether the test passes or fails, so the suite can run against
// the same seeded database repeatedly and against a shared one safely.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { closePool, getPool } from '../db/pool';
import { env } from '../config/env';
import { brands, marketingCompanies } from '../repositories/masters.repository';
import {
  createArtwork,
  getArtworkById,
  getArtworksByProduct,
  getCrossCompanyCandidates,
  getLabelAttributes,
  getLatestApprovedArtwork,
  setArtworkStorage,
  updateArtworkStatus,
  upsertLabelAttributes
} from '../repositories/artwork.repository';
import {
  assignApprovalStage,
  createComparison,
  getComparisonById,
  getComparisonsByProduct,
  getComparisonsByStatus,
  recordWorkflowDecision
} from '../repositories/comparison.repository';
import {
  createProduct,
  findPossibleDuplicate,
  getProductById,
  getProducts,
  getProductsByBrandAndCompany
} from '../repositories/product.repository';
import {
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  recordLogin,
  updateUser
} from '../repositories/users.repository';

const SKIP = env.databaseUrl ? false : 'DATABASE_URL is not set — see src/db/pool.ts';

/**
 * Runs `fn` in a transaction that is always rolled back.
 *
 * Not withTransaction(), which commits on success — that is the point. The
 * repositories take an optional `Queryable`, so handing them this client puts
 * their writes inside the doomed transaction, including the advisory locks
 * their id issuance takes (those release with it).
 */
async function inRolledBackTransaction(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Nothing to salvage, and an error here must not replace the test's own.
    }
    client.release();
  }
}

let savepointCounter = 0;

/**
 * Asserts a statement is rejected, and leaves the transaction usable.
 *
 * A statement that fails aborts its whole transaction: every command after it
 * fails with 'current transaction is aborted' until a rollback, so a second
 * assertion in the same test reports that instead of the constraint it was
 * checking, and a test cannot show both the rejected case and the admissible
 * one. A savepoint scopes the abort to the single statement.
 */
async function assertRejected(client: PoolClient, sql: string, pattern: RegExp): Promise<void> {
  const savepoint = `attempt_${(savepointCounter += 1)}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  await assert.rejects(() => client.query(sql), pattern);
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
}

before(async () => {
  if (SKIP) return;

  try {
    await getPool().query('SELECT 1');
  } catch (error) {
    throw new Error(
      `DATABASE_URL is set but the database is unreachable: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Start it (see backend/README.md) or unset DATABASE_URL to skip these tests.'
    );
  }

  const { rows } = await getPool().query<{ count: number }>(
    "SELECT count(*)::int AS count FROM products WHERE id = 'PRD-0001'"
  );
  if (rows[0].count === 0) {
    throw new Error(
      'The database is reachable but not seeded. Run `npm run db:migrate && npm run db:seed`.'
    );
  }
});

after(closePool);

describe('seed data as the repositories read it', { skip: SKIP }, () => {
  it('reads every seeded product', async () => {
    const products = await getProducts();
    assert.equal(products.length, 16);
    assert.equal(products[0].id, 'PRD-0001');
  });

  // The dates in these columns are TIMESTAMPTZ and are formatted in UTC by
  // mappers.toDateString. A seed that inserted a bare '2026-01-10' would have
  // Postgres apply the server's timezone, and east of UTC this assertion
  // fails by exactly one day — on a developer's machine but not on Render.
  it('reads back the calendar date the seed specified, whatever the server timezone', async () => {
    const product = await getProductById('PRD-0001');
    assert.equal(product?.createdDate, '2026-01-10');
    assert.equal(product?.updatedDate, '2026-06-02');

    // Crosses a month AND a year boundary, where an off-by-one is unmissable.
    const inactive = await getProductById('PRD-0010');
    assert.equal(inactive?.createdDate, '2025-11-18');
  });

  it('matches a possible duplicate regardless of case and padding', async () => {
    const found = await findPossibleDuplicate({
      productName: '  vitamin c gummies ',
      brandName: 'VITAFIT',
      marketingCompany: 'abc healthcare'
    });
    assert.equal(found?.id, 'PRD-0001');
  });

  it('finds every product for a brand and marketing company', async () => {
    const found = await getProductsByBrandAndCompany('VitaFit', 'ABC Healthcare');
    assert.deepEqual(
      found.map((product) => product.id).sort(),
      ['PRD-0001', 'PRD-0009']
    );
  });

  // Products reference brands by name through a real foreign key, so every
  // brand a seeded product uses has to exist as a master record. Six did not
  // until the seed was written — the frontend hid it by injecting a product's
  // current brand into its own dropdown.
  it('has a brand master record for every brand a product uses', async () => {
    const [products, brandList] = await Promise.all([getProducts(), brands.list()]);
    const known = new Set(brandList.map((brand) => brand.brandName));
    const missing = products.map((product) => product.brandName).filter((name) => !known.has(name));
    assert.deepEqual(missing, []);
  });

  it('reads master records with their audit fields', async () => {
    const companies = await marketingCompanies.list();
    assert.equal(companies.length, 7);

    const retired = companies.find((company) => company.id === 'MKT-0007');
    assert.equal(retired?.status, 'Inactive');
    assert.equal(retired?.updatedDate, '2026-04-01');
  });

  it('reads seeded users with no module overrides', async () => {
    const users = await listUsers();
    assert.equal(users.length, 5);
    // Absence, not an empty object: nobody has customised these users, so the
    // caller applies the role's defaults. See migration 003.
    assert.equal(users.every((user) => user.moduleAccess === undefined), true);
  });

  it('looks up a user by email case-insensitively', async () => {
    const user = await getUserByEmail('MANAGER@IMHEALTHCARE.COM');
    assert.equal(user?.id, 'U-001');
    assert.equal(user?.role, 'manager');
  });
});

describe('users repository writes', { skip: SKIP }, () => {
  const newUser = {
    fullName: 'Test Reviewer',
    email: 'test.reviewer@imhealthcare.com',
    role: 'technical',
    department: 'Technical',
    status: 'Active' as const
  };

  // The seeded directory is numbered 'U-001'..'U-005' while this backend
  // issues 'USR-0001'. Both layouts have to be read as one sequence, or the
  // next id collides with a row that already exists.
  it('issues an id that does not collide with the seeded directory', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createUser(newUser, client);
      assert.equal(created.id, 'USR-0006');

      const second = await createUser({ ...newUser, email: 'second.reviewer@imhealthcare.com' }, client);
      assert.equal(second.id, 'USR-0007');
    });
  });

  it('stores module overrides and reads them back', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createUser(
        { ...newUser, moduleAccess: { masters: true, reports: false } },
        client
      );
      assert.deepEqual(created.moduleAccess, { masters: true, reports: false });

      const reread = await getUserById(created.id, client);
      assert.deepEqual(reread?.moduleAccess, { masters: true, reports: false });
    });
  });

  it('replaces the whole sheet on update, so an omitted module loses its override', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createUser(
        { ...newUser, moduleAccess: { masters: true, reports: false } },
        client
      );

      const updated = await updateUser(created.id, { moduleAccess: { masters: false } }, client);
      assert.deepEqual(updated?.moduleAccess, { masters: false });
    });
  });

  it('leaves overrides alone when a patch does not mention them', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createUser({ ...newUser, moduleAccess: { masters: true } }, client);

      const updated = await updateUser(created.id, { department: 'Quality' }, client);
      assert.equal(updated?.department, 'Quality');
      assert.deepEqual(updated?.moduleAccess, { masters: true });
    });
  });

  it('clears every override when sent an empty sheet', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createUser({ ...newUser, moduleAccess: { masters: true } }, client);

      const updated = await updateUser(created.id, { moduleAccess: {} }, client);
      assert.equal(updated?.moduleAccess, undefined);
    });
  });

  it('rejects a module id the app does not have, by name', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () => createUser({ ...newUser, moduleAccess: { dashbaord: true } as never }, client),
        /Unknown module in moduleAccess/
      );
    });
  });

  it('reports a duplicate email as a duplicate email', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () => createUser({ ...newUser, email: 'manager@imhealthcare.com' }, client),
        /already exists/
      );
    });
  });

  // An unknown id is `undefined` everywhere else in this repository, and a
  // patch of overrides alone must not become a foreign-key error instead.
  it('returns undefined for an unknown id, even for an overrides-only patch', async () => {
    await inRolledBackTransaction(async (client) => {
      assert.equal(await updateUser('USR-9999', { moduleAccess: { masters: true } }, client), undefined);
      assert.equal(await updateUser('USR-9999', { department: 'Nowhere' }, client), undefined);
    });
  });

  it('records a login without touching the profile', async () => {
    await inRolledBackTransaction(async (client) => {
      const before = await getUserById('U-002', client);
      assert.equal(before?.lastLogin, undefined);

      const after = await recordLogin('U-002', client);
      assert.notEqual(after?.lastLogin, undefined);
      assert.equal(after?.fullName, before?.fullName);
    });
  });
});

describe('products repository writes', { skip: SKIP }, () => {
  it('names the missing master when a reference does not resolve', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          createProduct(
            {
              productName: 'Nonexistent Brand Gummies',
              brandName: 'NoSuchBrand',
              marketingCompany: 'ABC Healthcare',
              manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
              flavour: 'Orange',
              fssaiNumber: '10023045000000',
              status: 'Active'
            },
            'Test Actor',
            undefined,
            client
          ),
        /Brand "NoSuchBrand" does not exist\./
      );
    });
  });
});

// The two queries the Label Comparison module is built on, plus the label
// attributes it reads either side of a comparison.
describe('artwork repository', { skip: SKIP }, () => {
  // Grouped by artwork type in the order the artwork_type enum declares them
  // (Full Label first — the primary artefact), and newest version first inside
  // each group. Ordering by an enum column sorts by declaration order, not
  // alphabetically, which is the behaviour wanted here.
  it('lists a product every version, newest first within each artwork type', async () => {
    const artworks = await getArtworksByProduct('PRD-0001');
    assert.deepEqual(
      artworks.map((artwork) => `${artwork.artworkType} ${artwork.version}`),
      [
        'Full Label V5',
        'Full Label V4',
        'Full Label V3',
        'Full Label V2',
        'Full Label V1',
        'Front Artwork V4',
        'Back Artwork V3'
      ]
    );
  });

  // The auto-select the brief calls for: V5 exists but is a Draft, so the
  // baseline is V4. Picking the highest version outright would compare a new
  // label against something nobody approved.
  it('picks the latest APPROVED version as the baseline, not the latest version', async () => {
    const baseline = await getLatestApprovedArtwork('PRD-0001', 'ABC Healthcare');
    assert.equal(baseline?.id, 'ART-0004');
    assert.equal(baseline?.version, 'V4');
    assert.equal(baseline?.status, 'Approved');
  });

  it('keeps each artwork type its own version line', async () => {
    const front = await getLatestApprovedArtwork('PRD-0001', 'ABC Healthcare', 'Front Artwork');
    assert.equal(front?.id, 'ART-0009');

    // The only Back Artwork is Archived, so there is no approved baseline for
    // that type even though the product has plenty of approved Full Labels.
    assert.equal(await getLatestApprovedArtwork('PRD-0001', 'ABC Healthcare', 'Back Artwork'), undefined);
  });

  it('reports no baseline for a product whose only label is unapproved', async () => {
    // PRD-0003's single artwork is Pending Comparison — a first-ever label,
    // which the workflow has to report rather than treat as an error.
    assert.equal(await getLatestApprovedArtwork('PRD-0003', 'ABC Healthcare'), undefined);
  });

  it('finds the same product at other companies, never the product itself', async () => {
    const candidates = await getCrossCompanyCandidates('Vitamin C Gummies', 'ABC Healthcare');
    assert.deepEqual(
      candidates.map((candidate) => `${candidate.marketingCompany}:${candidate.artworkId}`),
      ['NutriCare:ART-0012', 'XYZ Healthcare:ART-0011']
    );
    assert.equal(candidates.some((candidate) => candidate.productId === 'PRD-0001'), false);
  });

  // Every seeded artwork predates object storage, so it has no storage key.
  // '' is the app's representation of that, and the UI shows "preview not
  // available" for it rather than treating it as a broken record.
  it('reads a missing file as an empty path, not a broken one', async () => {
    const artwork = await getArtworkById('ART-0004');
    assert.equal(artwork?.filePath, '');
    assert.equal(artwork?.fileName, 'VitaminC_Gummies_V4.pdf');
  });

  it('issues the next version in that product+company+type line', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createArtwork(
        {
          productId: 'PRD-0001',
          productName: 'Vitamin C Gummies',
          brand: 'VitaFit',
          marketingCompany: 'ABC Healthcare',
          manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
          artworkType: 'Full Label',
          fileName: 'VitaminC_Gummies_V6.pdf',
          fileType: 'application/pdf',
          fileSize: 1_500_000,
          filePath: '',
          status: 'Draft',
          remarks: 'Next revision.'
        },
        'Test Actor',
        client
      );

      // V1..V5 exist for this line, so this is V6 — and a Front Artwork line
      // that only reaches V4 must not influence it.
      assert.equal(created.version, 'V6');
      assert.equal(created.id, 'ART-0013');
      assert.equal(created.filePath, '');
    });
  });

  it('names the product when the product does not exist', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          createArtwork(
            {
              productId: 'PRD-9999',
              productName: 'Ghost Gummies',
              brand: 'VitaFit',
              marketingCompany: 'ABC Healthcare',
              manufacturingCompany: 'IM Healthcare Pvt. Ltd.',
              artworkType: 'Full Label',
              fileName: 'ghost.pdf',
              fileType: 'application/pdf',
              fileSize: 1000,
              filePath: '',
              status: 'Draft',
              remarks: ''
            },
            'Test Actor',
            client
          ),
        /Product "PRD-9999" does not exist/
      );
    });
  });

  it('advances status and leaves remarks alone unless given new ones', async () => {
    await inRolledBackTransaction(async (client) => {
      const kept = await updateArtworkStatus('ART-0005', 'Pending Comparison', 'Test Actor', undefined, client);
      assert.equal(kept?.status, 'Pending Comparison');
      assert.equal(kept?.remarks, 'Draft refresh for new packaging size.');

      const replaced = await updateArtworkStatus('ART-0005', 'Under Review', 'Test Actor', 'Now in review.', client);
      assert.equal(replaced?.remarks, 'Now in review.');
    });
  });

  it('records where the file landed without looking like a user edit', async () => {
    await inRolledBackTransaction(async (client) => {
      const before = await getArtworkById('ART-0004', client);
      const stored = await setArtworkStorage('ART-0004', 'artworks/ART-0004/v4.pdf', undefined, client);
      assert.equal(stored?.filePath, 'artworks/ART-0004/v4.pdf');
      assert.equal(stored?.updatedBy, before?.updatedBy);
      assert.equal(stored?.updatedDate, before?.updatedDate);
    });
  });
});

describe('label attributes', { skip: SKIP }, () => {
  it('reads a seeded extraction with its provenance', async () => {
    const attributes = await getLabelAttributes('ART-0004');
    assert.equal(attributes?.colourTheme, 'Green & Orange gradient');
    assert.equal(attributes?.claims, 'Supports Immunity | High in Vitamin C');
    // 'seed', not 'ocr' — a reviewer has to be able to tell hand-authored
    // values from what an engine read off the label.
    assert.equal(attributes?.source, 'seed');
    assert.equal(attributes?.extractionEngine, undefined);
  });

  // The distinction the comparison engine depends on: an artwork nobody has
  // extracted is not an artwork whose every field came back empty.
  it('returns undefined for an artwork that was never extracted', async () => {
    assert.equal(await getLabelAttributes('ART-0001'), undefined);
  });

  it('stores an extraction and replaces it wholesale on re-extraction', async () => {
    await inRolledBackTransaction(async (client) => {
      const first = await upsertLabelAttributes(
        'ART-0001',
        { brandName: 'VitaFit', colourTheme: 'Green & Orange gradient', flavour: 'Orange' },
        { source: 'ocr', extractionEngine: 'tesseract@7.0.0' },
        client
      );
      assert.equal(first.brandName, 'VitaFit');
      assert.equal(first.extractionEngine, 'tesseract@7.0.0');

      // colourTheme is absent this time. A re-extraction that no longer reads a
      // field has not left the old value true, so it is cleared rather than
      // carried forward.
      const second = await upsertLabelAttributes(
        'ART-0001',
        { brandName: 'VitaFit', flavour: 'Orange' },
        { source: 'manual' },
        client
      );
      assert.equal(second.colourTheme, '');
      assert.equal(second.source, 'manual');
      assert.equal(second.extractionEngine, undefined);
    });
  });

  it('accepts an unread field as empty and stores it as absent', async () => {
    await inRolledBackTransaction(async (client) => {
      const stored = await upsertLabelAttributes(
        'ART-0001',
        { brandName: 'VitaFit', colourTheme: '', logo: '   ' },
        { source: 'ocr' },
        client
      );
      assert.equal(stored.colourTheme, '');
      assert.equal(stored.logo, '');

      // Absent in the database, not stored as an empty string — which is what
      // the no-blank-values CHECK would otherwise have rejected.
      const { rows } = await client.query<{ colour_theme: string | null }>(
        "SELECT colour_theme FROM artwork_label_attributes WHERE artwork_id = 'ART-0001'"
      );
      assert.equal(rows[0].colour_theme, null);
    });
  });

  it('refuses a placeholder and explains why', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          upsertLabelAttributes(
            'ART-0001',
            { brandName: 'VitaFit', colourTheme: 'Not specified' },
            { source: 'ocr' },
            client
          ),
        /placeholder stored as content/
      );
    });
  });

  it('names the artwork when it does not exist', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () => upsertLabelAttributes('ART-9999', { brandName: 'Ghost' }, { source: 'ocr' }, client),
        /Artwork "ART-9999" does not exist/
      );
    });
  });
});

describe('comparison repository', { skip: SKIP }, () => {
  it('assembles a comparison from its four tables', async () => {
    const comparison = await getComparisonById('CMP-0001');
    assert.equal(comparison?.status, 'Pending Label Final');
    assert.equal(comparison?.parameters.length, 13);
    assert.equal(comparison?.overallSimilarity, 92);
    assert.equal(comparison?.overallResult, 'REVIEW REQUIRED');

    const colour = comparison?.parameters.find((parameter) => parameter.parameter === 'Colour Theme');
    assert.equal(colour?.referenceValue, 'Green & Orange gradient');
    assert.equal(colour?.newValue, 'Green & Orange gradient (refreshed shade)');
    assert.equal(colour?.result, 'SIMILAR');
  });

  // These are joined from products/artworks on every read, never copied onto
  // the comparison row — so history cannot end up describing a product by a
  // name it no longer has.
  it('joins the display fields rather than storing them', async () => {
    const comparison = await getComparisonById('CMP-0001');
    assert.equal(comparison?.productName, 'Vitamin C Gummies');
    assert.equal(comparison?.newArtworkVersion, 'V5');
    assert.equal(comparison?.referenceArtworkVersion, 'V4');
    assert.equal(comparison?.newArtworkCompany, 'ABC Healthcare');
  });

  it('follows a product rename without touching the comparison row', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("UPDATE products SET product_name = 'Vitamin C Gummies (Reformulated)' WHERE id = 'PRD-0001'");
      const comparison = await getComparisonById('CMP-0001', client);
      assert.equal(comparison?.productName, 'Vitamin C Gummies (Reformulated)');
    });
  });

  it('keeps a cross-company comparison its reference from the other company', async () => {
    const comparison = await getComparisonById('CMP-0003');
    assert.equal(comparison?.stage, 'cross_company');
    assert.equal(comparison?.referenceArtworkId, 'ART-0012');
    assert.equal(comparison?.referenceArtworkCompany, 'NutriCare');
    assert.equal(comparison?.overallResult, 'CONFLICT');
  });

  it('reads the approvals queue by status', async () => {
    const completed = await getComparisonsByStatus(['Completed']);
    assert.deepEqual(completed.map((comparison) => comparison.id).sort(), ['CMP-0002', 'CMP-0003']);
  });

  it('reads every comparison for one product, newest first', async () => {
    const comparisons = await getComparisonsByProduct('PRD-0001');
    assert.deepEqual(comparisons.map((comparison) => comparison.id), ['CMP-0003', 'CMP-0001']);
  });

  it('stores a comparison with its parameters and counts what was comparable', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await createComparison(
        {
          productId: 'PRD-0001',
          stage: 'same_company',
          newArtworkId: 'ART-0005',
          referenceArtworkId: 'ART-0003',
          parameters: [
            { parameter: 'Brand Name', referenceValue: 'VitaFit', newValue: 'VitaFit', result: 'MATCH' },
            // Unread on the reference side, so MISSING is the only admissible
            // result — and it must not count as comparable.
            { parameter: 'Logo', referenceValue: '', newValue: 'VitaFit Apple Logo v2', result: 'MISSING' }
          ],
          overallSimilarity: 50,
          overallResult: 'REVIEW REQUIRED',
          status: 'Draft'
        },
        'Test Actor',
        client
      );

      assert.equal(created.id, 'CMP-0004');
      assert.equal(created.parameters.length, 2);

      const { rows } = await client.query<{ comparable: number; total: number }>(
        `SELECT comparable_parameter_count AS comparable, total_parameter_count AS total
           FROM comparisons WHERE id = $1`,
        [created.id]
      );
      assert.equal(rows[0].comparable, 1);
      assert.equal(rows[0].total, 2);
    });
  });

  it('refuses a verdict over a value it does not have, in words', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          createComparison(
            {
              productId: 'PRD-0001',
              stage: 'same_company',
              newArtworkId: 'ART-0005',
              referenceArtworkId: 'ART-0003',
              parameters: [
                { parameter: 'Logo', referenceValue: '', newValue: 'VitaFit Apple Logo v2', result: 'MATCH' }
              ],
              overallSimilarity: 100,
              overallResult: 'MATCH',
              status: 'Draft'
            },
            'Test Actor',
            client
          ),
        /only admissible result is MISSING/
      );
    });
  });

  it('refuses a same-company comparison with no baseline', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          createComparison(
            {
              productId: 'PRD-0001',
              stage: 'same_company',
              newArtworkId: 'ART-0005',
              parameters: [],
              overallSimilarity: 0,
              overallResult: 'REVIEW REQUIRED',
              status: 'Draft'
            },
            'Test Actor',
            client
          ),
        /needs a reference artwork/
      );
    });
  });

  // The transaction src/db/pool.ts exists for: status, audit entry and artwork
  // status are only correct as one write.
  it('moves the comparison, its history and the artwork together', async () => {
    await inRolledBackTransaction(async (client) => {
      const updated = await recordWorkflowDecision(
        'CMP-0001',
        {
          stage: 'Label Final',
          action: 'Sent to Technical',
          resultingStatus: 'Pending Technical',
          actor: { id: 'U-003', name: 'Neha Singh', role: 'label_final' },
          remarks: 'Wording checked.',
          artworkStatus: 'Under Review'
        },
        client
      );

      assert.equal(updated?.status, 'Pending Technical');
      assert.equal(updated?.history.length, 1);
      assert.equal(updated?.history[0].action, 'Sent to Technical');
      assert.equal(updated?.history[0].actorName, 'Neha Singh');

      // ART-0005 is CMP-0001's new artwork.
      const artwork = await getArtworkById('ART-0005', client);
      assert.equal(artwork?.status, 'Under Review');
    });
  });

  it('appends to history rather than replacing it', async () => {
    await inRolledBackTransaction(async (client) => {
      const decision = {
        stage: 'Label Final' as const,
        action: 'Sent to Technical' as const,
        resultingStatus: 'Pending Technical' as const,
        actor: { id: 'U-003', name: 'Neha Singh', role: 'label_final' }
      };
      await recordWorkflowDecision('CMP-0001', decision, client);
      const twice = await recordWorkflowDecision(
        'CMP-0001',
        { ...decision, stage: 'Technical', action: 'Sent to QA', resultingStatus: 'Pending QA' },
        client
      );
      assert.equal(twice?.history.length, 2);
      assert.deepEqual(twice?.history.map((entry) => entry.action), ['Sent to Technical', 'Sent to QA']);
    });
  });

  it('returns undefined for a decision on an unknown comparison', async () => {
    await inRolledBackTransaction(async (client) => {
      const result = await recordWorkflowDecision(
        'CMP-9999',
        {
          stage: 'QA',
          action: 'Sent to Manager',
          resultingStatus: 'Pending Manager Approval',
          actor: { id: 'U-005', name: 'Rahul Kumar', role: 'qa' }
        },
        client
      );
      assert.equal(result, undefined);
    });
  });

  it('gives a stage one owner, replacing rather than accumulating', async () => {
    await inRolledBackTransaction(async (client) => {
      const first = await assignApprovalStage('CMP-0001', 'Technical', 'U-004', 'Aman Kumar', client);
      assert.equal(first?.approvalAssignments.technical, 'U-004');

      const reassigned = await assignApprovalStage('CMP-0001', 'Technical', 'U-001', 'Aman Kumar', client);
      assert.equal(reassigned?.approvalAssignments.technical, 'U-001');

      const { rows } = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM comparison_approval_assignments WHERE comparison_id = 'CMP-0001'"
      );
      assert.equal(rows[0].count, 1);
    });
  });

  it('names the user when an assignment points at nobody', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () => assignApprovalStage('CMP-0001', 'QA', 'U-999', 'Aman Kumar', client),
        /User "U-999" does not exist/
      );
    });
  });
});

// The constraints below are the reason this app is on Postgres rather than a
// document store: they make the specific defects this domain has already
// produced unrepresentable. Each is claimed by a comment in migration 001;
// these tests are what make the claims checkable.
describe('schema invariants', { skip: SKIP }, () => {
  it('refuses to record a comparison result over a value it does not have', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        "DELETE FROM comparison_parameters WHERE comparison_id = 'CMP-0001' AND parameter = 'Logo'"
      );
      await assertRejected(
        client,
        `INSERT INTO comparison_parameters (comparison_id, parameter, reference_value, new_value, result)
         VALUES ('CMP-0001', 'Logo', NULL, 'VitaFit Apple Logo v2', 'MATCH')`,
        /comparison_parameters_absent_is_missing/
      );

      // MISSING is the one admissible result for the same row.
      await client.query(
        `INSERT INTO comparison_parameters (comparison_id, parameter, reference_value, new_value, result)
         VALUES ('CMP-0001', 'Logo', NULL, 'VitaFit Apple Logo v2', 'MISSING')`
      );
    });
  });

  it('refuses to store the placeholder that caused the false-MATCH defect', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO artwork_label_attributes (artwork_id, address, source)
             VALUES ('ART-0001', 'Not specified', 'seed')`
          ),
        /label_attributes_no_placeholder/
      );
    });
  });

  it('refuses an empty string where absence is meant', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO artwork_label_attributes (artwork_id, address, source)
             VALUES ('ART-0001', '', 'seed')`
          ),
        /label_attributes_no_blank_values/
      );
    });
  });

  it('keeps approval history append-only', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        `INSERT INTO comparison_workflow_history
           (comparison_id, stage, action, resulting_status, actor_id, actor_name, actor_role, remarks)
         VALUES ('CMP-0001', 'Label Final', 'Sent to Technical', 'Pending Technical',
                 'U-003', 'Neha Singh', 'label_final', 'Looks correct.')`
      );

      await assertRejected(
        client,
        "UPDATE comparison_workflow_history SET remarks = 'Actually, no.' WHERE comparison_id = 'CMP-0001'",
        /append-only/
      );
      await assertRejected(
        client,
        "DELETE FROM comparison_workflow_history WHERE comparison_id = 'CMP-0001'",
        /append-only/
      );
    });
  });

  it('will not let a comparison be its own baseline', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO comparisons (id, product_id, stage, new_artwork_id, reference_artwork_id,
                                      status, compared_by, updated_by)
             VALUES ('CMP-9001', 'PRD-0001', 'same_company', 'ART-0004', 'ART-0004',
                     'Draft', 'Test Actor', 'Test Actor')`
          ),
        /comparisons_no_self_comparison/
      );
    });
  });

  it('will not let two artworks claim the same version of the same label', async () => {
    await inRolledBackTransaction(async (client) => {
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO artworks (id, product_id, product_name, brand, marketing_company,
                                   manufacturing_company, version_number, artwork_type, status,
                                   file_name, mime_type, byte_size, uploaded_by, updated_by)
             VALUES ('ART-9001', 'PRD-0001', 'Vitamin C Gummies', 'VitaFit', 'ABC Healthcare',
                     'IM Healthcare Pvt. Ltd.', 4, 'Full Label', 'Draft',
                     'duplicate.pdf', 'application/pdf', 1000, 'Test Actor', 'Test Actor')`
          ),
        // Postgres truncates identifiers at 63 characters, which is why this
        // constraint's name stops mid-word.
        /artworks_product_id_marketing_company_artwork_type_version__key/
      );
    });
  });
});
