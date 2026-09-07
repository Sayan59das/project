-- Real authentication: a credential to prove who you are, and a session that
-- remembers it.
--
-- Until this migration the API had none. Every write was attributed by an
-- X-Actor-Name header the server simply believed (see the warning on
-- requireActor in src/controllers/http.ts), so anyone who could reach the
-- service could approve a label as anybody. In a system whose whole output is
-- an audit trail a pharma reviewer relies on, an actor nobody verified is not
-- a weaker audit trail — it is a false one, because it looks exactly like a
-- real one.
--
-- WHY A SESSION TABLE RATHER THAN A SIGNED TOKEN
-- ---------------------------------------------------------------------
-- A JWT would need no table, and that is precisely the problem. This app has
-- four user states (Active, Inactive, Pending, Restricted) and a Manager who
-- is expected to move people between them, plus per-user module overrides in
-- user_module_access that a Manager edits. All of that has to take effect at
-- once: an account set to Restricted while its owner is mid-review must stop
-- being able to approve, not keep approving until a token expires. A signed
-- token cannot be withdrawn, so honouring that would mean a revocation list —
-- a table, checked on every request, which is this table with extra steps and
-- a window of wrongness in front of it.
--
-- The cost is one indexed lookup per request. That is the same cost the
-- request was already going to pay to load the actor's role.

-- The credential itself.
--
-- NULLABLE, on purpose. A user row is a directory entry, and the directory is
-- populated (by seed, and by a Manager creating a colleague) before anybody
-- chooses a password. NULL means "this account cannot be logged into yet",
-- which is a true statement about a real state; the alternative — a sentinel
-- hash nothing can match — states the same thing in a way that looks like a
-- credential and would survive being copied somewhere that treats it as one.
--
-- Never the password. `scrypt` output, salt and parameters, in the encoded
-- form src/services/password.service.ts documents. The column is TEXT rather
-- than BYTEA so the parameters travel WITH the digest: a hash whose cost
-- factors are recorded elsewhere cannot be verified after those factors are
-- raised, and raising them is the one maintenance this column will need.
ALTER TABLE users
  ADD COLUMN password_hash TEXT,
  ADD CONSTRAINT users_password_hash_not_blank CHECK (password_hash IS NULL OR password_hash <> '');

-- When the credential was last set, which is not the same question as
-- users.updated_at (a Manager editing a phone number moves that one).
-- Recorded because "this password has not changed since the account was
-- created from a shared default" is a thing an administrator has to be able
-- to ask, and there is no way to ask it of the hash itself.
ALTER TABLE users
  ADD COLUMN password_updated_at TIMESTAMPTZ;

CREATE TABLE sessions (
  -- Random, not sequential. Every other id in this schema is a human-facing
  -- sequential code (USR-0001, PRD-0001) because a person reads it off a
  -- screen and says it out loud. Nobody reads a session id, and a sequential
  -- one would publish how many logins the system has ever had to anyone
  -- holding two of them.
  id           TEXT PRIMARY KEY,

  -- CASCADE, matching user_module_access and for the same reason: a session
  -- is meaningless without the user it authenticates. This is the opposite of
  -- how comparison_workflow_history references users (RESTRICT), and the
  -- difference is deliberate — an audit row must never lose the actor it
  -- names, a login must not outlive the account.
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- The SHA-256 of the token, never the token. Anyone who can read this table
  -- — a backup, a support query, a leaked dump — must not come away able to
  -- act as its owner. Unlike the password column this needs no salt or cost
  -- factor: the token is 32 bytes of CSPRNG output, so there is no guessable
  -- input space to slow an attacker down over.
  token_hash   TEXT NOT NULL UNIQUE,

  issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Absolute, set at issue. Not a sliding window: a sliding expiry on a
  -- system where reviewers keep a tab open all day never expires at all.
  expires_at   TIMESTAMPTZ NOT NULL,

  -- Advisory only — updated on use so an administrator can see a stale
  -- session, never consulted when deciding whether a session is valid. Kept
  -- separate from expires_at so that reading it can never be mistaken for
  -- extending the session.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set on logout, and when a Manager ends somebody's sessions. A row is
  -- retained rather than deleted so "this session existed and was ended at
  -- this time" stays answerable; expired and revoked rows are cleared out on
  -- a schedule, not at the moment they stop working.
  revoked_at   TIMESTAMPTZ,

  CONSTRAINT sessions_expires_after_issue CHECK (expires_at > issued_at)
);

-- The lookup every authenticated request makes is by token_hash, which the
-- UNIQUE constraint above already indexes.
--
-- This second index serves the other direction — "end every session belonging
-- to this user" — which runs when an account is deactivated or restricted.
-- Partial, because a revoked row is never a candidate for revoking again and
-- the dead rows would otherwise grow the index forever.
CREATE INDEX sessions_active_by_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- NOT recorded here: failed login attempts. They belong in an append-only
-- table of their own, in the style of comparison_workflow_history, because
-- the question they answer ("was this account under attack on Tuesday") is a
-- history question and this table only ever holds live state. Adding a
-- failed_attempts counter to users would answer it badly — a counter forgets
-- everything except its current value, which is exactly the property an
-- investigation cannot use.
