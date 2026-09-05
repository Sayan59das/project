// Per-user application preferences — localStorage-backed, one record per
// user id, same pattern as every other service in this app. Deliberately a
// flat, small settings object: only fields the Settings page actually reads
// belong here (see SettingsPage.tsx) — no unused configuration.
//
// Notification preferences below are stored for a future email/in-app
// notification service to read; nothing in this prototype sends anything
// yet — see SettingsPage.tsx's Notifications section copy.

export type AppSettings = {
  defaultLandingPage: string; // a route path, e.g. '/dashboard'
  pageSize: number; // default DataGrid rows-per-page across Products/Artwork/Reports
  confirmDestructiveActions: boolean; // gates this page's own Reset-to-Defaults confirmation
  approvalNotifications: boolean;
  revisionNotifications: boolean;
  artworkNotifications: boolean;
  systemNotifications: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultLandingPage: '/dashboard',
  pageSize: 10,
  confirmDestructiveActions: true,
  approvalNotifications: true,
  revisionNotifications: true,
  artworkNotifications: true,
  systemNotifications: true
};

const STORAGE_PREFIX = 'imh_lvs_settings_';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getSettings(userId: string): AppSettings {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(userId: string, patch: Partial<AppSettings>): AppSettings {
  const updated = { ...getSettings(userId), ...patch };
  localStorage.setItem(storageKey(userId), JSON.stringify(updated));
  return updated;
}

export function resetSettings(userId: string): AppSettings {
  localStorage.setItem(storageKey(userId), JSON.stringify(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS };
}
