// One cached copy of the user directory, shared by every screen that needs to
// put a name to a user id.
//
// WHY A CACHE AT ALL. Reading the directory used to be synchronous — a
// localStorage array — so pages called getUserById() inline while rendering a
// table row. Against an API that would be one request per row, fired during
// render. React Query holds a single list instead: the first screen that asks
// pays for the fetch, everything else reads it out of the cache, and a
// mutation invalidating USERS_QUERY_KEY updates all of them at once.
//
// It deliberately fetches the WHOLE directory rather than the users a screen
// happens to mention. This is a per-company reviewer list of tens of people,
// not a customer table, and the alternative — a lookup per unknown id — is the
// request-per-row problem again with extra steps.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppUser } from '../types/user';
import { RoleId } from '../auth/permissions';
import { getUsers, selectUsersByRole } from '../services/userService';

export const USERS_QUERY_KEY = ['users'] as const;

export type UserDirectory = {
  users: AppUser[];
  isLoading: boolean;
  error: unknown;
  /** Undefined for an id the directory does not have — render it as unknown, not as an error. */
  byId: (id: string | undefined) => AppUser | undefined;
  /** Active users of a role: the selectable pool for an approval stage. */
  byRole: (role: RoleId) => AppUser[];
};

export function useUserDirectory(): UserDirectory {
  const { data, isLoading, error } = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: getUsers,
    // Names and roles change when a Manager edits them, which already
    // invalidates this key. A minute keeps a tab that sits open from
    // re-fetching the same list on every screen change.
    staleTime: 60_000
  });

  const users = useMemo(() => data ?? [], [data]);
  const index = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  return useMemo(
    () => ({
      users,
      isLoading,
      error,
      byId: (id) => (id ? index.get(id) : undefined),
      byRole: (role) => selectUsersByRole(users, role)
    }),
    [users, index, isLoading, error]
  );
}

/** Invalidates the cached directory — call after any write that changes a user. */
export function useInvalidateUserDirectory(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  };
}
