// Mock authentication credentials for the frontend prototype ONLY.
//
// This file is intentionally the single place that knows about passwords.
// It is kept separate from `data/usersStore.ts` (user profile/role records)
// so that swapping this out for a real API (POST /auth/login) later does not
// touch the user directory, permission model, or any UI component.

export const MOCK_PASSWORD = 'password123';

export const MOCK_CREDENTIAL_EMAILS = [
  'manager@imhealthcare.com',
  'account@imhealthcare.com',
  'labelfinal@imhealthcare.com',
  'technical@imhealthcare.com',
  'qa@imhealthcare.com'
];

export function verifyMockCredentials(email: string, password: string): boolean {
  return (
    MOCK_CREDENTIAL_EMAILS.some((candidate) => candidate.toLowerCase() === email.trim().toLowerCase()) &&
    password === MOCK_PASSWORD
  );
}
