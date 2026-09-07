// The user record as the app uses it.
//
// Moved here from data/usersStore.ts when the directory stopped being a
// localStorage seed and became the `users` table: the shape is shared by
// services/userService.ts (which fetches it), services/authService.ts (which
// signs you in as one) and every page that renders one, and none of those
// should have to import from a store that no longer exists.
//
// `permissions` is assembled, not stored. The backend keeps a user's module
// OVERRIDES only (see the backend's 003_user_module_access.sql) and holds no
// copy of the role policy at all; auth/permissions.ts remains the single place
// that says what a role can do, and userService.toAppUser combines the two.

import { UserPermissions, RoleId } from '../auth/permissions';

export type UserStatus = 'Active' | 'Inactive' | 'Pending' | 'Restricted';

export type AppUser = {
  id: string;
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: UserStatus;
  createdDate: string;
  permissions: UserPermissions;
  // Optional — a user who has never signed in has no lastLogin, and phone was
  // added by the backend's migration 002 after the first users existed.
  phone?: string;
  lastLogin?: string;
};
