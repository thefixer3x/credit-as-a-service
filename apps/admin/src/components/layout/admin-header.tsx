"use client";

import React from 'react';
import { Button } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { 
  Bell, 
  Search, 
  User, 
  LogOut, 
  Settings,
  Shield,
  Activity,
  Clock,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AdminHeader() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center space-x-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">System Overview</h2>
            <p className="text-sm text-gray-500">
              Admin Console - {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Center Section - Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users, loans, transactions..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-4">
          {/* System Status */}
          <div className="hidden lg:flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-700">System Online</span>
            </div>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-4 w-4" />
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              5
            </Badge>
          </Button>

          {/* Critical Alerts */}
          <Button variant="ghost" size="sm" className="relative">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              2
            </Badge>
          </Button>

          {/* Admin Profile */}
          <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">Super Admin</p>
              <p className="text-xs text-gray-500">Full Access</p>
            </div>
            <div className="relative">
              <div className="h-8 w-8 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white" />
            </div>
          </div>

          {/* Admin Actions */}
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Admin Alert Bar */}
      <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-800">
              Administrative Session Active
            </span>
            <Badge variant="destructive" className="text-xs">
              Super Admin
            </Badge>
          </div>
          <div className="flex items-center space-x-4 text-xs text-red-600">
            <div className="flex items-center space-x-1">
              <Clock className="h-3 w-3" />
              <span>Session: 2h 15m</span>
            </div>
            <div className="flex items-center space-x-1">
              <Activity className="h-3 w-3" />
              <span>Last Action: 2m ago</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}