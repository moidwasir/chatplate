import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';
/** Socket.IO lives on the API origin, without the /v1 prefix */
export const SOCKET_URL = new URL(API_URL).origin;

const REFRESH_KEY = 'safi.refreshToken';

// Access token lives in memory only; the refresh token survives reloads.
// TODO(security): move the refresh token to an httpOnly cookie before go-live.
let accessToken: string | null = null;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export const tokens = {
  set(pair: TokenPair) {
    accessToken = pair.accessToken;
    try {
      localStorage.setItem(REFRESH_KEY, pair.refreshToken);
    } catch {}
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {}
  },
  refreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  hasAccess: () => accessToken !== null,
};

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// One refresh at a time — concurrent 401s wait on the same promise
let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  const refreshToken = tokens.refreshToken();
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= axios
    .post<TokenPair>(`${API_URL}/auth/refresh`, { refreshToken })
    .then((res) => {
      tokens.set(res.data);
      return true;
    })
    .catch(() => {
      tokens.clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Called when the session can't be recovered — the auth store sends the user to /login */
let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status !== 401 || !original || original._retried) throw error;

  original._retried = true;
  if (await refreshSession()) return api(original);
  onSessionExpired();
  throw error;
});

/** Pull a readable message out of an API error */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (msg) return msg;
    if (!err.response) return 'Cannot reach the server';
  }
  return 'Something went wrong';
}
