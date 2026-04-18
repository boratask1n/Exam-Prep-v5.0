const AUTH_SESSION_KEY = "exam-prep-auth-session";
const AUTH_REMEMBER_KEY = "exam-prep-auth-remember";

export type AuthSession = {
  userId: number;
  name: string;
  email: string;
  token: string;
  expiresAt: string;
  remember: boolean;
  loginAt: number;
};

function getStorage(remember: boolean): Storage | null {
  if (typeof window === "undefined") return null;
  return remember ? window.localStorage : window.sessionStorage;
}

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const fromSession = window.sessionStorage.getItem(AUTH_SESSION_KEY);
  if (fromSession) {
    try {
      return JSON.parse(fromSession) as AuthSession;
    } catch {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    }
  }

  const fromLocal = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (fromLocal) {
    try {
      return JSON.parse(fromLocal) as AuthSession;
    } catch {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
    }
  }

  return null;
}

export function saveAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_REMEMBER_KEY, session.remember ? "true" : "false");
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  const storage = getStorage(session.remember);
  storage?.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function getAuthToken() {
  return readAuthSession()?.token ?? null;
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function getRememberDefault() {
  if (typeof window === "undefined") return true;
  const value = window.localStorage.getItem(AUTH_REMEMBER_KEY);
  if (value === "false") return false;
  return true;
}
