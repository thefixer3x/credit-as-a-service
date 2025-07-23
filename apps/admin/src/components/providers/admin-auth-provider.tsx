'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'admin' | 'support';
  permissions: string[];
  lastLogin: string;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedUser = localStorage.getItem('caas-admin-user');
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          setUser(userData);
        }
      } catch (error) {
        console.error('Admin auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string, twoFactorCode?: string) => {
    setLoading(true);
    try {
      // Simulate admin login with 2FA
      const mockAdminUser: AdminUser = {
        id: '1',
        email,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'super_admin',
        permissions: [
          'users:read',
          'users:write',
          'users:delete',
          'loans:read',
          'loans:write',
          'loans:approve',
          'system:config',
          'system:logs',
          'analytics:read',
          'reports:generate'
        ],
        lastLogin: new Date().toISOString(),
      };
      
      localStorage.setItem('caas-admin-user', JSON.stringify(mockAdminUser));
      setUser(mockAdminUser);
    } catch (error) {
      throw new Error('Admin login failed');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('caas-admin-user');
    setUser(null);
  };

  const hasPermission = (permission: string): boolean => {
    return user?.permissions.includes(permission) || false;
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AdminAuthContext.Provider>
  );
}