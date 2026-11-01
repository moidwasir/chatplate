import { create } from 'zustand';
import { api, refreshSession, setSessionExpiredHandler, tokens, type TokenPair } from './api';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'RIDER';

export interface Me {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  branches: { id: string; name: string }[];
}

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  user: Me | null;
  branchId: string | null;
  /** Restore a session from the stored refresh token (on page load) */
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setBranch: (branchId: string) => void;
}

const BRANCH_KEY = 'safi.branchId';

function pickBranch(user: Me): string | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(BRANCH_KEY);
  } catch {}
  return user.branches.find((b) => b.id === saved)?.id ?? user.branches[0]?.id ?? null;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  branchId: null,

  async bootstrap() {
    if (!tokens.hasAccess() && !(await refreshSession())) {
      set({ status: 'anonymous', user: null });
      return;
    }
    try {
      const { data } = await api.get<Me>('/auth/me');
      set({ status: 'authenticated', user: data, branchId: pickBranch(data) });
    } catch {
      tokens.clear();
      set({ status: 'anonymous', user: null });
    }
  },

  async login(email, password) {
    const { data } = await api.post<TokenPair>('/auth/login', { email, password });
    tokens.set(data);
    await get().bootstrap();
  },

  async logout() {
    const refreshToken = tokens.refreshToken();
    tokens.clear();
    set({ status: 'anonymous', user: null });
    if (refreshToken) await api.post('/auth/logout', { refreshToken }).catch(() => {});
  },

  setBranch(branchId) {
    try {
      localStorage.setItem(BRANCH_KEY, branchId);
    } catch {}
    set({ branchId });
  },
}));

setSessionExpiredHandler(() => useAuth.setState({ status: 'anonymous', user: null }));
