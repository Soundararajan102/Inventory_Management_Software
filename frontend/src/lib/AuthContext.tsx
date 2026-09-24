import React, { createContext, useContext, useState, useEffect } from 'react';
import { getDb } from './db';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'billing' | 'stock';
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  login: (username: string, pin: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent login (optional)
    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, pin: string) => {
    try {
      const db = await getDb();
      const users = await db.select<any[]>(
        'SELECT id, username, role, permissions FROM users WHERE username = $1 AND pin = $2',
        [username, pin]
      );

      if (users.length > 0) {
        const rawUser = users[0];
        let perms: string[] = [];
        try {
          if (rawUser.permissions) perms = JSON.parse(rawUser.permissions);
        } catch(e) {}

        const loggedInUser: User = {
          id: rawUser.id,
          username: rawUser.username,
          role: rawUser.role,
          permissions: perms
        };
        setUser(loggedInUser);
        localStorage.setItem('auth_user', JSON.stringify(loggedInUser));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login error', e);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
