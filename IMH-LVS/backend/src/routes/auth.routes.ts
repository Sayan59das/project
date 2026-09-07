// Signing in, signing out, asking who you are, and changing your own password.
//
// This is the only router mounted without requireSession in front of it, for
// the obvious reason that you cannot present a session in order to obtain one.
// Each handler below therefore states for itself whether it needs an
// authenticated caller — /login and /logout do not, /me and /password do.

import { Router } from 'express';
import { env } from '../config/env';
import { asyncHandler, requireString, sendData } from '../controllers/http';
import { DomainError, UnauthenticatedError } from '../middleware/domainError';
import { SESSION_COOKIE, requireSession } from '../middleware/auth.middleware';
import { hashPassword, rejectWeakPassword, verifyPassword } from '../services/password.service';
import {
  issueSession,
  revokeAllSessionsForUser,
  revokeSessionByToken
} from '../repositories/session.repository';
import { getCredentialByEmail, getUserById, recordLogin, setPasswordHash } from '../repositories/users.repository';

const router = Router();

/**
 * One message for every way a sign-in can fail on the credential.
 *
 * Unknown email, no password set, and wrong password are indistinguishable in
 * the response on purpose: an endpoint that says "no such user" is an endpoint
 * that enumerates the staff directory for anyone who asks.
 *
 * An inactive account is the deliberate exception — see the login handler.
 */
const INVALID_CREDENTIALS = 'Invalid email or password.';

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // Script on the page must never be able to read this. It is the single
    // property that makes a cookie safer than a token in localStorage: an XSS
    // bug can still act as the user while the page is open, but it cannot
    // copy the session out to somewhere it keeps working afterwards.
    secure: env.sessionCookieCrossSite,
    sameSite: env.sessionCookieCrossSite ? ('none' as const) : ('lax' as const),
    expires: expiresAt,
    path: '/'
  };
}

/**
 * Exchanges an email and password for a session.
 *
 * Deliberately NOT rate-limited here. Rate limiting belongs in front of the
 * process (Render's edge, or a reverse proxy) where it can see an address
 * across restarts and across instances; an in-memory counter in this handler
 * would reset on every deploy and would not be shared by two containers, which
 * makes it a control that reports success without providing any.
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = requireString(req.body, 'email');
    const password = requireString(req.body, 'password');

    const credential = await getCredentialByEmail(email.trim());

    // The password is verified even when there is no such user, against a
    // hash that cannot match. Skipping the work would make a missing account
    // answer measurably faster than a wrong password, which turns the
    // deliberately-identical message above back into an enumeration oracle.
    const storedHash = credential?.passwordHash ?? DUMMY_HASH;
    const passwordMatches = await verifyPassword(password, storedHash);

    if (!credential || !credential.passwordHash || !passwordMatches) {
      throw new DomainError(INVALID_CREDENTIALS, 401);
    }

    // Said plainly, unlike the credential failures above. Once the password
    // has been proved the account is the caller's own, so there is nothing to
    // enumerate — and "your account is not active, contact your
    // administrator" is the difference between someone filing a ticket and
    // someone retyping a password they know is right.
    if (credential.status !== 'Active') {
      throw new DomainError(
        `This account is ${credential.status.toLowerCase()}. Contact your administrator.`,
        403
      );
    }

    const { token, expiresAt } = await issueSession(credential.id, env.sessionTtlHours * 60 * 60 * 1000);
    const user = (await recordLogin(credential.id)) ?? (await getUserById(credential.id));

    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

    // The token is in the body as well as the cookie, for non-browser callers
    // (the tests, a script) that have no cookie jar. A browser client should
    // ignore it and let the cookie do the work — anything the page stores
    // itself is reachable by script, which is the property the httpOnly
    // cookie exists to avoid.
    sendData(res, { user, token, expiresAt: expiresAt.toISOString() });
  })
);

/**
 * Ends the current session.
 *
 * Not behind requireSession: logging out with a token that has already expired
 * must still clear the cookie rather than returning a 401 the client then has
 * to special-case. Succeeds whether or not there was anything to end.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.get('cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    if (token) await revokeSessionByToken(decodeURIComponent(token));

    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(new Date(0)), expires: undefined });
    sendData(res, { signedOut: true });
  })
);

/**
 * The signed-in user, for a client restoring its state on page load.
 *
 * This is what makes an httpOnly cookie workable for a SPA: the page cannot
 * read the cookie, so it asks the server who it is instead. A 401 here is the
 * normal answer for a visitor who is not signed in, not an error to report.
 */
router.get(
  '/me',
  requireSession,
  asyncHandler(async (req, res) => {
    if (!req.actor) throw new UnauthenticatedError();
    sendData(res, { user: req.actor.user });
  })
);

/**
 * Changes your own password. Not somebody else's — there is no user id in the
 * path, and the actor comes from the session.
 *
 * Requires the current password even though the caller is already
 * authenticated. That is not redundant: it is what stops a borrowed unlocked
 * laptop, or a session lifted by an XSS bug, from being turned into permanent
 * access by changing the credential out from under the owner.
 */
router.post(
  '/password',
  requireSession,
  asyncHandler(async (req, res) => {
    if (!req.actor) throw new UnauthenticatedError();

    const currentPassword = requireString(req.body, 'currentPassword');
    const newPassword = requireString(req.body, 'newPassword');

    const credential = await getCredentialByEmail(req.actor.user.email);
    if (!credential?.passwordHash || !(await verifyPassword(currentPassword, credential.passwordHash))) {
      throw new DomainError('Current password is incorrect.', 403);
    }

    const weak = rejectWeakPassword(newPassword);
    if (weak) throw new DomainError(weak);

    await setPasswordHash(req.actor.user.id, await hashPassword(newPassword));

    // Every other session ends, and this one is reissued. A password change
    // whose whole purpose is to lock somebody out does nothing at all if the
    // sessions they already hold keep working — and signing the person doing
    // it out of their own browser as a side effect is a good way to teach them
    // not to bother changing it.
    await revokeAllSessionsForUser(req.actor.user.id);
    const { token, expiresAt } = await issueSession(
      req.actor.user.id,
      env.sessionTtlHours * 60 * 60 * 1000
    );
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

    sendData(res, { passwordChanged: true, token, expiresAt: expiresAt.toISOString() });
  })
);

/**
 * A syntactically valid hash that no password produces, used to keep the
 * unknown-email path doing the same work as the known-email one.
 *
 * Built once at module load rather than per request: generating it per login
 * would add its own timing signal, which is the thing this exists to remove.
 * The salt and digest are fixed arbitrary bytes — there is no password behind
 * them, and it does not matter that they are in the source, because the only
 * thing anyone can learn from a value nothing hashes to is that nothing
 * hashes to it.
 */
const DUMMY_HASH = `scrypt$N=16384,r=8,p=1$${Buffer.alloc(16, 1).toString('base64url')}$${Buffer.alloc(64, 2).toString('base64url')}`;

export default router;
