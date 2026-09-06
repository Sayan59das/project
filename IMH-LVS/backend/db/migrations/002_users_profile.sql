-- Align the users table with the shape the app actually stores.
--
-- 001_init.sql modelled users from the fields the comparison workflow
-- touches (id, name, email, role, status). The real record — see the
-- frontend's src/data/usersStore.ts, which is what has to load into this
-- table — also carries a department and an optional phone number, and its
-- status has four values where 001 reused the two-value master_status enum.
--
-- Collapsing 'Pending' and 'Restricted' into 'Inactive' was the alternative
-- and it is not acceptable here: 'Restricted' is an access-control state a
-- reviewer is expected to see and act on, and silently rewriting it to
-- 'Inactive' would misreport who can approve a label.

CREATE TYPE user_status AS ENUM ('Active', 'Inactive', 'Pending', 'Restricted');

-- No USING clause is needed for the value mapping itself — every existing
-- master_status value ('Active', 'Inactive') is also a user_status value —
-- but Postgres will not implicitly cast between two enum types, so the
-- conversion goes via text.
ALTER TABLE users
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE user_status USING status::text::user_status,
  ALTER COLUMN status SET DEFAULT 'Active';

-- Defaulted to '' rather than made nullable: every user in the directory
-- belongs to a department, and an empty string is how the frontend already
-- represents "not filled in" for this field. Absence and emptiness are not
-- meaningfully different here, unlike label attribute values where the
-- distinction is load-bearing.
ALTER TABLE users
  ADD COLUMN department TEXT NOT NULL DEFAULT '';

-- Phone genuinely is optional — most seed users have none at all — so it is
-- nullable, with the same "never store an empty string" rule the label
-- attributes use.
ALTER TABLE users
  ADD COLUMN phone TEXT,
  ADD CONSTRAINT users_phone_not_blank CHECK (phone IS NULL OR phone <> '');

-- The login page looks users up by email, and Postgres will not use a
-- b-tree index for that unless one exists on the citext column. UNIQUE
-- already created one on email in 001, so nothing further is needed —
-- noted here so a future reader does not add a redundant one.
