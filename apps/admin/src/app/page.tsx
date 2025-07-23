"use client";

import React from 'react';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { AdminLayout } from '@/components/layout/admin-layout';

export default function AdminHomePage() {
  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  );
}