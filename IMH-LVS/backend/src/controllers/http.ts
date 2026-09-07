// Shared plumbing for the persistence routes.
//
// Every controller in this folder is deliberately thin: parse the request,
// call one repository function, shape the response. The rules the app has to
// obey live in the database and the repositories, not here — a validation
// re-implemented in a controller is a second copy that drifts from the
// constraint it was meant to mirror.

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { DomainError, NotFoundError, UnauthenticatedError } from '../middleware/domainError';
import { AppUser } from '../types/domain';

/**
 * Sends an async handler's rejection to the error middleware.
 *
 * Express 4 does not await handlers, so a rejected promise inside one is an
 * unhandled rejection: the client waits until it times out and the error
 * middleware never runs. Every async route below is wrapped in this.
 */
export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** The success envelope every existing route already returns. */
export function sendData(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

/**
 * Returns `value`, or throws the 404 the caller would otherwise have to write.
 *
 * The repositories return `undefined` for an unknown id rather than throwing,
 * because "no such record" is a legitimate answer to a question, not a failure.
 * Turning it into a status code is the HTTP layer's job, and it belongs in one
 * place so every route reports a missing record the same way.
 */
export function orNotFound<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new NotFoundError(`${what} was not found.`);
  return value;
}

/**
 * Who is making this request.
 *
 * This IS authentication now. The actor comes from the session resolved by
 * requireSession (src/middleware/auth.middleware.ts) — a row in `sessions`
 * matched by the hash of a token the caller proved they hold — and NOT from
 * anything the caller can assert about themselves.
 *
 * Until 004_auth.sql this read an X-Actor-Name header and believed it, which
 * meant anyone who could reach the API could approve a label under someone
 * else's name. That header is now ignored wherever it still arrives: a client
 * mid-migration that keeps sending it gets its real identity recorded rather
 * than the claimed one, so the two can overlap without the old behaviour
 * leaking through.
 *
 * Throwing rather than defaulting is unchanged and still the point: 'system'
 * or 'unknown' in an audit trail a pharma reviewer relies on is worse than a
 * refused request, because it looks like a real answer. The only difference is
 * that the failure is now a 401 the client can act on rather than a 400 about
 * a missing header.
 */
export function requireActor(req: Request): string {
  return requireActorRecord(req).fullName;
}

/**
 * The full actor a workflow decision records: id, name and role.
 *
 * All three come off the authenticated user, so they are necessarily
 * consistent with each other and with the `users` row they name. The previous
 * version assembled them from three separate headers, which allowed a caller
 * to pair one person's id with another person's role — an audit entry that is
 * internally contradictory and impossible to detect after the fact.
 */
export function requireWorkflowActor(req: Request): { id: string; name: string; role: string } {
  const user = requireActorRecord(req);
  return { id: user.id, name: user.fullName, role: user.role };
}

function requireActorRecord(req: Request): AppUser {
  if (!req.actor) {
    // Reachable only by mounting a route that calls this behind no
    // requireSession — a wiring mistake, not something a client can cause.
    // It is still an UnauthenticatedError rather than a 500, because the
    // honest answer to "who is acting" is nobody.
    throw new UnauthenticatedError();
  }
  return req.actor.user;
}

/**
 * A required field from a JSON body.
 *
 * Only presence and type are checked here. Whether the VALUE is acceptable —
 * a brand that exists, a status in the enum, a comparison result admissible
 * over the values it compares — is the database's judgement, and the
 * repositories already translate those refusals into messages worth showing.
 */
export function requireString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError(`"${field}" is required.`);
  }
  return value;
}

/** An optional field, absent when not supplied. */
export function optionalString(body: unknown, field: string): string | undefined {
  const value = (body as Record<string, unknown> | null)?.[field];
  return typeof value === 'string' ? value : undefined;
}
