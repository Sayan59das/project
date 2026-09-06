// An error whose message is meant for the person using the app.
//
// The repositories already turn database constraint violations into sentences
// a reviewer can act on — 'Brand "BoneStrong" does not exist.', 'the only
// admissible result is MISSING' — and those messages are the whole point of
// the translation. Without a type to carry them they arrive at the error
// handler as ordinary Errors, indistinguishable from a null dereference, and
// get flattened to a 500 'Unexpected server error.' The user then sees nothing
// about the brand they typed wrong.
//
// The alternative — string-matching messages in the error handler — puts the
// contract in the text of the message, so rewording an error silently changes
// its HTTP status. A type is checkable and the compiler enforces it.
//
// Anything NOT thrown as a DomainError stays a 500 with its detail logged
// server-side and withheld from the response. That default matters: a database
// error can quote table names, column values and fragments of other people's
// data, and none of that belongs in an HTTP body.

export class DomainError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    // Without this, `instanceof DomainError` is false for subclasses when the
    // build targets ES5 — TypeScript's documented caveat on extending Error.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 — the record named in the request does not exist. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 — the request conflicts with what is already stored.
 *
 * Distinct from a 400: the request is well-formed and would have been valid a
 * moment ago. A duplicate email, a version of a label that already exists.
 */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}
