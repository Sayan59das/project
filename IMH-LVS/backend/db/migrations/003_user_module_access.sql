-- Per-user module access overrides.
--
-- 001/002 modelled the user record but not its permissions, and the app does
-- store those: UsersPage's save handler writes
--   { modules: formState.moduleAccess, actions: <role defaults> }
-- through usersStore.updateUser. Serving users out of Postgres without this
-- table would silently discard whatever a Manager ticked or unticked in that
-- dialog and hand every user their role's defaults instead — an
-- access-control regression, and the same class of mistake 002 refused to
-- make when it declined to collapse 'Restricted' into 'Inactive'.
--
-- WHAT IS STORED, AND WHAT IS NOT
-- ---------------------------------------------------------------------
-- The `actions` half of UserPermissions is NOT stored. UsersPage recomputes
-- it from the role on every save (getDefaultPermissionsForRole(role).actions)
-- and offers no control that edits it, so it is derived data. Persisting it
-- would create a second copy of ROLE_ACTIONS that goes stale the moment
-- src/auth/permissions.ts changes — and a stale action list is how a
-- capability that was deliberately revoked comes back.
--
-- Module access IS stored, because it is the one half a human overrides.
--
-- ABSENCE MEANS "NO OVERRIDE", NOT "NO ACCESS"
-- ---------------------------------------------------------------------
-- A user with no rows here has simply never been customised, and the caller
-- applies the role's defaults (ROLE_MODULE_ACCESS in
-- src/auth/permissions.ts, which stays the single source of that policy —
-- the backend deliberately keeps no copy of it). Reading absence as "denied"
-- would lock every existing user out of every page the moment this migration
-- ran, and would make the seed responsible for restating a policy it does
-- not own.

-- An enum rather than TEXT: the module list is a closed set defined by
-- MODULES in src/auth/permissions.ts, and a typo'd or retired id must not be
-- grantable. The cost is that adding a module needs an
-- `ALTER TYPE app_module ADD VALUE` migration — deliberate friction on an
-- access-control surface, where a silently-created row is worse than a
-- failed deploy.
CREATE TYPE app_module AS ENUM (
  'dashboard', 'products', 'artwork', 'comparison', 'approvals',
  'qa-verification', 'reports', 'masters', 'users', 'settings'
);

CREATE TABLE user_module_access (
  -- CASCADE, unlike every other reference to users (id), which is RESTRICT.
  -- An override is meaningless without the user it applies to, whereas an
  -- audit-history row must never lose the actor it names.
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module  app_module NOT NULL,
  allowed BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module)
);

-- No granted_by column, on purpose. The users table carries no
-- created_by/updated_by and UserInput carries no actor, so there is nothing
-- truthful to write into one today; inventing 'system' for every row would
-- make the audit trail look complete while recording nothing. When the users
-- API does carry an actor, the honest home for it is an append-only table in
-- the style of comparison_workflow_history — not a mutable column here that
-- only ever remembers the most recent change.
--
-- The primary key already indexes the "what can this user reach" lookup,
-- which is the only direction the app asks. A reverse query ("who can reach
-- Users") would want an index on (module, allowed); it has no caller yet.
