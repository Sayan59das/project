// Centralized RBAC configuration for IMH LVS.
// This is the single source of truth for roles, modules and action-level
// permissions. UI components (Sidebar, Navbar, ProtectedRoute, pages) should
// always read access decisions from here rather than hardcoding role checks,
// so a future backend can replace only AuthContext/usersStore without
// touching this contract.

export type RoleId = 'account_manager' | 'label_final' | 'technical' | 'qa' | 'manager';

export type ModuleId =
  | 'dashboard'
  | 'products'
  | 'artwork'
  | 'comparison'
  | 'approvals'
  | 'qa-verification'
  | 'reports'
  | 'masters'
  | 'users'
  | 'settings';

export type ActionId =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'DELETE'
  | 'UPLOAD'
  | 'COMPARE'
  // Send a completed artwork/comparison into the approval pipeline for the
  // first time (Artwork's "Send for Comparison", Comparison's "Send for
  // Review"). Distinct from SUBMIT below — this is Account Manager's own
  // action, not a stage reviewer's. Previously both were the same 'SUBMIT'
  // action, which let Label Final/Technical see and trigger it too; kept
  // separate here so each business action maps to exactly one capability.
  | 'INITIATE'
  // Submit MY OWN stage decision (Label Final/Technical's approve-and-send-
  // onward action in Approvals). Not used for entering the pipeline — see
  // INITIATE above.
  | 'SUBMIT'
  | 'REVIEW'
  | 'VERIFY'
  | 'APPROVE'
  | 'APPROVE_FINAL'
  | 'REJECT'
  | 'EXPORT'
  | 'MANAGE_USERS'
  | 'MANAGE_MASTERS'
  | 'MANAGE_SETTINGS';

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'account_manager', label: 'Account Manager' },
  { id: 'label_final', label: 'Label Final' },
  { id: 'technical', label: 'Technical' },
  { id: 'qa', label: 'QA' },
  { id: 'manager', label: 'Manager' }
];

export const ROLE_LABELS: Record<RoleId, string> = ROLES.reduce(
  (acc, role) => ({ ...acc, [role.id]: role.label }),
  {} as Record<RoleId, string>
);

export const MODULES: { id: ModuleId; label: string; path: string }[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { id: 'products', label: 'Products', path: '/products' },
  { id: 'artwork', label: 'Artwork', path: '/artwork' },
  { id: 'comparison', label: 'Comparison', path: '/comparison' },
  { id: 'approvals', label: 'Approvals', path: '/approvals' },
  { id: 'qa-verification', label: 'QA Verification', path: '/qa' },
  { id: 'reports', label: 'Reports', path: '/reports' },
  { id: 'masters', label: 'Masters', path: '/master-data' },
  { id: 'users', label: 'Users', path: '/users' },
  { id: 'settings', label: 'Settings', path: '/settings' }
];

export const MODULE_LABELS: Record<ModuleId, string> = MODULES.reduce(
  (acc, module) => ({ ...acc, [module.id]: module.label }),
  {} as Record<ModuleId, string>
);

// Module access = can the role open this page at all (drives sidebar + route guard).
// Settings is a personal-preferences page only (no system/business
// configuration lives there) — every role manages their own. Masters/Users
// stay Manager-only administrative modules.
export const ROLE_MODULE_ACCESS: Record<RoleId, Record<ModuleId, boolean>> = {
  account_manager: {
    dashboard: true,
    products: true,
    artwork: true,
    comparison: true,
    approvals: true,
    'qa-verification': false,
    reports: true,
    masters: false,
    users: false,
    settings: true
  },
  label_final: {
    dashboard: true,
    products: true,
    artwork: true,
    comparison: true,
    approvals: true,
    'qa-verification': true,
    reports: true,
    masters: false,
    users: false,
    settings: true
  },
  technical: {
    dashboard: true,
    products: true,
    artwork: true,
    comparison: true,
    approvals: true,
    'qa-verification': true,
    reports: true,
    masters: false,
    users: false,
    settings: true
  },
  qa: {
    dashboard: true,
    products: true,
    artwork: true,
    comparison: true,
    approvals: true,
    'qa-verification': true,
    reports: true,
    masters: false,
    users: false,
    settings: true
  },
  manager: {
    dashboard: true,
    products: true,
    artwork: true,
    comparison: true,
    approvals: true,
    'qa-verification': true,
    reports: true,
    masters: true,
    users: true,
    settings: true
  }
};

// Action-level permissions = what the role can do once inside a module.
// COMPARE (create/run a comparison) is Account Manager's operational job of
// initiating the workflow — QA does NOT hold it: QA's responsibility is to
// verify label compliance/artwork accuracy/quality, not to create or manage
// comparisons. QA still reaches comparison data through VIEW/REVIEW (the
// read-only context already surfaced inside QA Verification and Approvals).
export const ROLE_ACTIONS: Record<RoleId, ActionId[]> = {
  account_manager: ['VIEW', 'CREATE', 'EDIT', 'UPLOAD', 'COMPARE', 'INITIATE', 'EXPORT'],
  label_final: ['VIEW', 'REVIEW', 'SUBMIT', 'REJECT', 'EXPORT'],
  technical: ['VIEW', 'REVIEW', 'SUBMIT', 'REJECT', 'EXPORT'],
  qa: ['VIEW', 'REVIEW', 'VERIFY', 'APPROVE', 'REJECT', 'EXPORT'],
  manager: [
    'VIEW',
    'CREATE',
    'EDIT',
    'DELETE',
    'UPLOAD',
    'COMPARE',
    'REVIEW',
    'SUBMIT',
    'INITIATE',
    'VERIFY',
    'APPROVE',
    'APPROVE_FINAL',
    'REJECT',
    'EXPORT',
    'MANAGE_USERS',
    'MANAGE_MASTERS',
    'MANAGE_SETTINGS'
  ]
};

export type UserPermissions = {
  modules: Record<ModuleId, boolean>;
  actions: ActionId[];
};

export function getDefaultPermissionsForRole(role: RoleId): UserPermissions {
  return {
    modules: { ...ROLE_MODULE_ACCESS[role] },
    actions: [...ROLE_ACTIONS[role]]
  };
}

export function moduleIdForPath(pathname: string): ModuleId | undefined {
  return MODULES.find((module) => module.path === pathname)?.id;
}
