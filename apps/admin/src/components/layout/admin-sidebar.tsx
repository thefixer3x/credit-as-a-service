"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  Shield,
  BarChart3,
  FileText,
  AlertTriangle,
  Database,
  Activity,
  Lock,
  Zap,
  Server,
  UserCheck,
  DollarSign
} from 'lucide-react';

interface AdminNavigationItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  permission?: string;
}

const adminNavigationItems: AdminNavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    name: 'User Management',
    href: '/users',
    icon: Users,
    permission: 'users:read'
  },
  {
    name: 'Loan Management',
    href: '/loans',
    icon: CreditCard,
    permission: 'loans:read'
  },
  {
    name: 'Risk Analytics',
    href: '/analytics',
    icon: BarChart3,
    permission: 'analytics:read'
  },
  {
    name: 'System Logs',
    href: '/logs',
    icon: Activity,
    badge: 'Live',
    permission: 'system:logs'
  },
  {
    name: 'API Gateway',
    href: '/gateway',
    icon: Server,
    badge: 'Active'
  },
  {
    name: 'Compliance',
    href: '/compliance',
    icon: Shield,
    permission: 'compliance:read'
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: FileText,
    permission: 'reports:generate'
  },
  {
    name: 'System Config',
    href: '/config',
    icon: Settings,
    permission: 'system:config'
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">CAAS Admin</h1>
            <p className="text-xs text-gray-500">Enterprise Console</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {adminNavigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <Badge 
                    variant={item.badge === 'Live' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {item.badge}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">Admin Mode</span>
          </div>
          <p className="text-xs text-red-600 mt-1">
            Full system access enabled
          </p>
        </div>
      </div>
    </div>
  );
}