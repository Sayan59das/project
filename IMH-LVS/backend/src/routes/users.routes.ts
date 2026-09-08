// The reviewer/approver directory.
//
// No password field anywhere, and no route here that touches one. Credentials
// live behind /auth — issuing a session, and changing your OWN password with
// the current one — so that a Manager editing somebody's role can never be the
// same request that sets their password. Every route below is already behind
// requireSession (see routes/index.ts).

import { Router } from 'express';
import {
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  recordLogin,
  updateUser,
  UserInput
} from '../repositories/users.repository';
import { asyncHandler, orNotFound, requireString, sendData } from '../controllers/http';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // ?email= is how the login screen resolves the person signing in. Exact
    // match, case-insensitive at the column type (citext), so it cannot be
    // used to enumerate the directory by prefix.
    const email = req.query.email;
    if (typeof email === 'string') {
      const user = await getUserByEmail(email);
      sendData(res, user ?? null);
      return;
    }
    sendData(res, await listUsers());
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    sendData(res, orNotFound(await getUserById(req.params.id), `User "${req.params.id}"`));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // Presence-checked here because a user row with a blank name or email is
    // storable — the columns are NOT NULL but '' satisfies that — and a
    // nameless reviewer in an approval trail is unhelpful in a way the
    // database has no opinion about.
    requireString(req.body, 'fullName');
    requireString(req.body, 'email');
    requireString(req.body, 'role');
    sendData(res, await createUser(req.body as UserInput), 201);
  })
);

/**
 * Update a user, including their module access overrides.
 *
 * `moduleAccess` present in the body replaces the whole sheet; absent leaves it
 * untouched. That is the repository's contract and the Users dialog matches it
 * by always sending every checkbox — see migration 003 for why only overrides
 * are stored and why absence means "role default", not "no access".
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const updated = await updateUser(req.params.id, req.body as Partial<UserInput>);
    sendData(res, orNotFound(updated, `User "${req.params.id}"`));
  })
);

// Records a sign-in timestamp. A POST because it changes stored state, and its
// own route because it is not a profile edit — it deliberately leaves
// updated_at alone so a sign-in never looks like someone editing the record.
router.post(
  '/:id/login',
  asyncHandler(async (req, res) => {
    sendData(res, orNotFound(await recordLogin(req.params.id), `User "${req.params.id}"`));
  })
);

export default router;
