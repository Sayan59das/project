// Turns a presented session token into a verified actor on the request, and
// refuses the request when there isn't one.
//
// This is the middleware the comment on requireActor (src/controllers/http.ts)
// was written in anticipation of. Before it, the actor recorded against every
// approval was whatever the caller typed in a header. After it, the actor is
// whoever holds a live session, and the header is ignored entirely — a
// consumer that still sends X-Actor-Name gets its real identity recorded, not
// the claimed one, which is the only safe way for the two to overlap during a
// frontend migration.

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenError, UnauthenticatedError } from './domainError';
import { AuthenticatedActor, authenticateSession } from '../repositories/session.repository';

/** The cookie a browser client holds. */
export const SESSION_COOKIE = 'imh_lvs_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by requireSession, and only by requireSession. Absent on every
       * unauthenticated route, which is why the helpers in http.ts throw
       * rather than defaulting when they don't find it.
       */
      actor?: AuthenticatedActor;
    }
  }
}

/**
 * Reads the token from the cookie, falling back to `Authorization: Bearer`.
 *
 * Both, because they serve different clients and neither covers the other.
 * The browser app uses the cookie — httpOnly, so script on the page cannot
 * read it and an XSS bug cannot exfiltrate a working session, which is not
 * true of any token the frontend stores itself. Bearer exists for the tests
 * and for any non-browser caller, where a cookie jar is friction and there is
 * no document for script to run in.
 *
 * The cookie is checked first so that a browser that has one cannot be
 * steered onto a header an attacker controls.
 */
function readToken(req: Request): string | undefined {
  const cookie = parseCookies(req.get('cookie'))[SESSION_COOKIE];
  if (cookie) return cookie;

  const authorization = req.get('authorization');
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }
  return undefined;
}

/**
 * Minimal cookie header parsing, rather than the `cookie-parser` dependency.
 *
 * The header is a well-defined `name=value; name=value` list and this needs
 * exactly one name out of it. Signed cookies, which are the reason to reach
 * for cookie-parser, buy nothing here: the token is opaque CSPRNG output
 * validated against the sessions table, so a forged value fails the lookup
 * whether or not it also carries a signature.
 */
function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && value && !(name in out)) out[name] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Rejects the request unless it carries a live session for an Active user.
 *
 * Applied per router in routes/index.ts rather than app-wide, so that adding a
 * route cannot accidentally inherit "public" — an unauthenticated route has to
 * be mounted somewhere that deliberately has no guard, and there are exactly
 * two of those (see routes/index.ts).
 */
export const requireSession: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = readToken(req);
  if (!token) {
    next(new UnauthenticatedError());
    return;
  }

  authenticateSession(token)
    .then((actor) => {
      if (!actor) {
        next(new UnauthenticatedError());
        return;
      }
      req.actor = actor;
      next();
    })
    .catch(next);
};

/**
 * Rejects the request unless the signed-in user holds one of `roles`.
 *
 * WHAT THIS DOES NOT DO: it does not reimplement ROLE_MODULE_ACCESS. Migration
 * 003 refused to copy that policy into the backend, and it was right to —
 * module access decides which pages a person is shown, the frontend owns it,
 * and a second copy here would go stale the moment src/auth/permissions.ts
 * changed.
 *
 * The rule enforced here is a different one: which ROLE may take a given
 * workflow decision. That is not a navigation preference, it is the domain
 * rule the whole approval chain exists to express (Label Final -> Technical ->
 * QA -> Manager), and a rule the server does not enforce is a rule that holds
 * only for as long as everyone uses the official UI.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) {
      next(new UnauthenticatedError());
      return;
    }
    if (!roles.includes(req.actor.user.role)) {
      next(
        new ForbiddenError(
          `This action is limited to ${roles.join(' or ')}. You are signed in as ${req.actor.user.role}.`
        )
      );
      return;
    }
    next();
  };
}
