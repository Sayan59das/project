// Shared plumbing for the persistence routes.
//
// Every controller in this folder is deliberately thin: parse the request,
// call one repository function, shape the response. The rules the app has to
// obey live in the database and the repositories, not here — a validation
// re-implemented in a controller is a second copy that drifts from the
// constraint it was meant to mirror.

import { NextFunction, Request, RequestHandler, Response } from 'express';
import { DomainError, NotFoundError } from '../middleware/domainError';

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
 * THIS IS NOT AUTHENTICATION. There is no auth on this backend yet, and the
 * audit trail still has to name someone, so the caller states who they are in
 * a header and the server believes it. Anyone who can reach this API can claim
 * to be anyone.
 *
 * It is a header rather than a body field so that reads, writes and multipart
 * uploads all carry it the same way, and so replacing this function with a
 * decoded session is a change in one place. Until then, this API must not be
 * exposed outside a trusted network — see backend/README.md.
 *
 * Missing is an error rather than a default: 'system' or 'unknown' in an audit
 * trail a pharma reviewer relies on is worse than a refused request, because it
 * looks like a real answer.
 */
export function requireActor(req: Request): string {
  const actor = header(req, 'x-actor-name');
  if (!actor) {
    throw new DomainError(
      'Missing X-Actor-Name header. Every write is recorded against a person, so the caller has to say who is acting.'
    );
  }
  return actor;
}

/** The full actor a workflow decision records: id, name and role. */
export function requireWorkflowActor(req: Request): { id: string; name: string; role: string } {
  const id = header(req, 'x-actor-id');
  const role = header(req, 'x-actor-role');
  const name = requireActor(req);

  if (!id || !role) {
    throw new DomainError(
      'A workflow decision is recorded against a specific user. Send X-Actor-Id, X-Actor-Name and X-Actor-Role.'
    );
  }
  return { id, name, role };
}

function header(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
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
