"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CreditCard,
  Users,
  TrendingUp,
  Settings,
  Bell,
  Search,
  Menu,
  Zap,
  Server
} from 'lucide-react';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const navigationItems: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Gateway Hub',
    href: '/gateway',
    icon: Server,
    badge: 'Synced'
  },
  {
    name: 'Loans',
    href: '/loans',
    icon: CreditCard,
  },
  {
    name: 'Users',
    href: '/users',
    icon: Users,
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: TrendingUp,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-r border-gray-200 w-64 min-h-screen p-4">
      {/* Logo */}
      <div className="flex items-center space-x-2 mb-8">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
          <Zap className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">CAAS Platform</h1>
          <p className="text-xs text-gray-500">Credit-as-a-Service</p>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="space-y-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
                {item.badge && (
                  <Badge variant="secondary" className="ml-auto">
                    {item.badge}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom Section */}
      <div className="mt-auto pt-8">
        <div className="border-t border-gray-200 pt-4">
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
            <Badge variant="destructive" className="ml-auto">
              3
            </Badge>
          </Button>
        </div>
      </div>
    </nav>
  );
}