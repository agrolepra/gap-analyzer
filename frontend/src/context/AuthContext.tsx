import React, { createContext, useContext, useState, useCallback } from 'react';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';

interface AuthContextType {
  token: string | null;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  isAuthenticated: boolean;
  authHeader: () => Record<string, string>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  login: async () => 'Error',
  logout: () => {},
  isAuthenticated: false,
  authHeader: () => ({}),
  authFetch: (url) => fetch(url),
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authToken'));

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${WORKER}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Error de autenticación';
      localStorage.setItem('authToken', data.token);
      setToken(data.token);
      return null; // null = sin error
    } catch {
      return 'No se pudo conectar con el servidor';
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    setToken(null);
  }, []);

  const authHeader = useCallback((): Record<string, string> => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  // Wrapper de fetch que hace logout automático si el servidor devuelve 401
  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const res = await fetch(url, {
      ...options,
      headers: { ...((options.headers as Record<string, string>) || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      setToken(null);
    }
    return res;
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token, authHeader, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
