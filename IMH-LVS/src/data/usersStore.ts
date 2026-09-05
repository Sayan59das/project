// Mock user directory backed by localStorage.
// This stands in for a future Users REST API: swap the body of these
// functions for fetch() calls and every caller (UsersPage, AuthContext)
// keeps working unchanged.

import { getDefaultPermissionsForRole, RoleId, UserPermissions } from '../auth/permissions';

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
  // Optional — absent on seed users until the profile is edited / the user
  // logs in for the first time since this field was introduced.
  phone?: string;
  lastLogin?: string;
};

const STORAGE_KEY = 'imh_lvs_users';

const SEED_USERS: AppUser[] = [
  {
    id: 'U-001',
    fullName: 'Aman Kumar',
    email: 'manager@imhealthcare.com',
    role: 'manager',
    department: 'Management',
    status: 'Active',
    createdDate: '2026-01-05',
    permissions: getDefaultPermissionsForRole('manager')
  },
  {
    id: 'U-002',
    fullName: 'Priya Sharma',
    email: 'account@imhealthcare.com',
    role: 'account_manager',
    department: 'Marketing',
    status: 'Active',
    createdDate: '2026-01-12',
    permissions: getDefaultPermissionsForRole('account_manager')
  },
  {
    id: 'U-003',
    fullName: 'Neha Singh',
    email: 'labelfinal@imhealthcare.com',
    role: 'label_final',
    department: 'Label',
    status: 'Active',
    createdDate: '2026-01-18',
    permissions: getDefaultPermissionsForRole('label_final')
  },
  {
    id: 'U-004',
    fullName: 'Rohit Verma',
    email: 'technical@imhealthcare.com',
    role: 'technical',
    department: 'Technical',
    status: 'Active',
    createdDate: '2026-02-02',
    permissions: getDefaultPermissionsForRole('technical')
  },
  {
    id: 'U-005',
    fullName: 'Rahul Kumar',
    email: 'qa@imhealthcare.com',
    role: 'qa',
    department: 'Quality',
    status: 'Active',
    createdDate: '2026-02-10',
    permissions: getDefaultPermissionsForRole('qa')
  }
];

function readAll(): AppUser[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }
  try {
    return JSON.parse(raw) as AppUser[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }
}

function writeAll(users: AppUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getUsers(): AppUser[] {
  return readAll();
}

// Active users of a given role — the selectable pool for approval-stage
// assignment (see comparisonService.assignApprovalStage): only a Label
// Final user can be assigned the Label Final stage, and so on.
export function getUsersByRole(role: RoleId): AppUser[] {
  return readAll().filter((user) => user.role === role && user.status === 'Active');
}

export function getUserByEmail(email: string): AppUser | undefined {
  return readAll().find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(id: string): AppUser | undefined {
  return readAll().find((user) => user.id === id);
}

export function createUser(input: {
  fullName: string;
  email: string;
  role: RoleId;
  department: string;
  status: UserStatus;
  permissions?: UserPermissions;
}): AppUser {
  const users = readAll();
  const newUser: AppUser = {
    id: `U-${String(users.length + 1).padStart(3, '0')}-${Date.now().toString(36).slice(-4)}`,
    fullName: input.fullName,
    email: input.email,
    role: input.role,
    department: input.department,
    status: input.status,
    createdDate: new Date().toISOString().slice(0, 10),
    permissions: input.permissions ?? getDefaultPermissionsForRole(input.role)
  };
  writeAll([...users, newUser]);
  return newUser;
}

export function updateUser(id: string, patch: Partial<Omit<AppUser, 'id' | 'createdDate'>>): AppUser | undefined {
  const users = readAll();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) return undefined;
  const updated = { ...users[index], ...patch };
  users[index] = updated;
  writeAll(users);
  return updated;
}

export function setUserStatus(id: string, status: UserStatus): AppUser | undefined {
  return updateUser(id, { status });
}
