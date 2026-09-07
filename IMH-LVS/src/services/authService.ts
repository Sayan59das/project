// Signing in and out against the real API.
//
// This replaces src/auth/mockUsers.ts, which matched a hard-coded password
// against a list of emails in the bundle — i.e. every visitor could read the
// credential out of the JavaScript. The password is now checked server-side
// against a scrypt hash, and what comes back is an httpOnly cookie the page
// cannot read.
//
// The user record the API returns carries a role and any per-user module
// overrides; the ROLE -> permissions policy stays in src/auth/permissions.ts,
// which is the single source of it. The backend deliberately keeps no copy
// (see the backend's 003_user_module_access.sql), so assembling the two is
// userService.toAppUser's job — shared with the directory so that the user you
// sign in as and the same user read out of Users are the same object shape.

import { apiRequest } from './apiClient';
import { AppUser } from '../types/user';
import { ApiUser, toAppUser } from './userService';

export async function login(email: string, password: string): Promise<AppUser> {
  const { user } = await apiRequest<{ user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: { email, password }
  });
  return toAppUser(user);
}

export async function logout(): Promise<void> {
  await apiRequest<{ signedOut: boolean }>('/auth/logout', { method: 'POST' });
}

/**
 * The signed-in user, or null.
 *
 * Null rather than a thrown error for a 401, because "nobody is signed in" is
 * the ordinary answer for a visitor loading the login page — not a failure to
 * report. Every other error is still thrown: a backend that is unreachable
 * must not be indistinguishable from a visitor who is simply signed out, or
 * the app silently shows a login form for a problem signing in cannot fix.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const { user } = await apiRequest<{ user: ApiUser }>('/auth/me');
    return toAppUser(user);
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) return null;
    throw error;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest<{ passwordChanged: boolean }>('/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}
