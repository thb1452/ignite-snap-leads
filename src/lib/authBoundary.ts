export type AppRole = 'admin' | 'va' | 'user';

export interface PermissionState<User extends { id: string }> {
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  error: string | null;
}

/** Browser navigation only; server policies remain the authorization boundary. */
export function hasAllowedRole(roles: readonly AppRole[], allowed: readonly AppRole[]): boolean {
  return allowed.some((role) => roles.includes(role));
}

/** Discard stale permission responses before exposing a different identity. */
export function createAuthBoundary<User extends { id: string }>(options: {
  loadRoles: (userId: string, signal: AbortSignal) => Promise<AppRole[]>;
  clearSessionData: () => void;
  onChange: (state: PermissionState<User>) => void;
  timeoutMs?: number;
}) {
  let currentUser: User | null = null;
  let initialized = false;
  let generation = 0;
  let disposed = false;
  let controller: AbortController | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    controller?.abort();
    clearTimeout(scheduled);
    clearTimeout(timeout);
  };
  const fail = (message = 'We could not verify your account permissions. Please try again.') => {
    if (disposed) return;
    generation += 1;
    cancel();
    options.onChange({ user: currentUser, roles: [], loading: false, error: message });
  };
  const apply = (user: User | null) => {
    if (disposed) return;
    const ticket = ++generation;
    cancel();
    if (!initialized || currentUser?.id !== user?.id) options.clearSessionData();
    initialized = true;
    currentUser = user;
    options.onChange({ user, roles: [], loading: !!user, error: null });
    if (!user) return;

    const request = new AbortController();
    controller = request;
    timeout = setTimeout(() => {
      if (!disposed && generation === ticket) fail();
    }, options.timeoutMs ?? 8000);
    // Never make a Supabase request inside its onAuthStateChange callback lock.
    scheduled = setTimeout(async () => {
      try {
        const roles = await options.loadRoles(user.id, request.signal);
        if (disposed || generation !== ticket || request.signal.aborted) return;
        clearTimeout(timeout);
        options.onChange({ user, roles, loading: false, error: null });
      } catch {
        if (!disposed && generation === ticket) fail();
      }
    }, 0);
  };
  return {
    apply,
    fail,
    dispose() {
      disposed = true;
      generation += 1;
      cancel();
    },
  };
}
