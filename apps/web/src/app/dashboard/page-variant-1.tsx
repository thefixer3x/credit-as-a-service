// Dashboard Page Variant 1 - Generated Component Placeholder
// This file is a placeholder for the 21st.dev component generation API response
// Once the API responds with the component code, it will be placed here for review

/*
Expected Component Structure:
- Dashboard Overview Page
- Key Metrics Cards (Total Loans, Active Users, Revenue, Approval Rates)
- Charts for Loan Analytics
- Recent Activities List
- User Management Overview
- Modern Fintech Design Patterns
*/

"use client";

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  CheckCircle, 
  ArrowUp, 
  ArrowDown,
  CreditCard,
  Activity,
  Clock,
  AlertCircle,
  MoreHorizontal,
  Eye,
  Edit,
  Filter,
  Search,
  Download
} from 'lucide-react';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { Button } from '@caas/ui-kit';

// Chart configuration for styling
const chartColors = {
  approved: '#22c55e',
  rejected: '#ef4444', 
  pending: '#f59e0b',
};

// Types
interface MetricCardProps {
  title: string
  value: string
  change: number
  icon: React.ComponentType<{ className?: string }>
  trend?: number[]
}

interface Activity {
  id: string
  type: "loan_approved" | "user_registered" | "payment_received" | "loan_rejected"
  description: string
  timestamp: string
  amount?: string
  status: "success" | "pending" | "failed"
}

interface User {
  id: string
  name: string
  email: string
  status: "active" | "inactive" | "pending"
  totalLoans: number
  creditScore: number
  joinDate: string
}


// Metric Card Component
const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, icon: Icon, trend = [] }) => {
  const isPositive = change >= 0;
  
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={cn(
            "p-3 rounded-lg",
            isPositive ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
          )}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={cn(
            "flex items-center space-x-1 text-sm font-medium",
            isPositive ? "text-green-600" : "text-red-600"
          )}>
            {isPositive ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
            <span>{Math.abs(change)}%</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">vs last month</p>
        </div>
      </div>
      
      {trend.length > 0 && (
        <div className="mt-4 h-12">
          <svg className="w-full h-full" viewBox="0 0 100 40">
            <polyline
              fill="none"
              stroke={isPositive ? "#22c55e" : "#ef4444"}
              strokeWidth="2"
              points={trend.map((value, index) => 
                `${(index / (trend.length - 1)) * 100},${40 - (value / Math.max(...trend)) * 30}`
              ).join(' ')}
            />
          </svg>
        </div>
      )}
    </Card>
  );
};

// Activity Item Component
const ActivityItem: React.FC<{ activity: Activity }> = ({ activity }) => {
  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'loan_approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'user_registered':
        return <Users className="h-4 w-4 text-blue-600" />;
      case 'payment_received':
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'loan_rejected':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: Activity['status']) => {
    const variant = status === 'success' ? 'default' : 
                   status === 'pending' ? 'secondary' : 'destructive';
    
    return (
      <Badge variant={variant}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border last:border-b-0">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-muted rounded-lg">
          {getActivityIcon(activity.type)}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{activity.description}</p>
          <div className="flex items-center space-x-2 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {activity.amount && (
          <span className="text-sm font-semibold text-foreground">{activity.amount}</span>
        )}
        {getStatusBadge(activity.status)}
      </div>
    </div>
  );
};

// User Table Row Component
const UserTableRow: React.FC<{ user: User }> = ({ user }) => {
  const getStatusBadge = (status: User['status']) => {
    const variant = status === 'active' ? 'default' : 
                   status === 'pending' ? 'secondary' : 'outline';
    
    return (
      <Badge variant={variant}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-foreground">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        {getStatusBadge(user.status)}
      </td>
      <td className="px-4 py-3 text-foreground">
        {user.totalLoans}
      </td>
      <td className="px-4 py-3 text-foreground">
        {user.creditScore}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {user.joinDate}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" aria-label="View user">
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Edit user">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="More options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

// Main Dashboard Component
const FintechDashboard: React.FC = () => {
  // Sample data
  const metrics = [
    {
      title: "Total Loans",
      value: formatCurrency(12500000),
      change: 12.5,
      icon: CreditCard,
      trend: [65, 70, 68, 75, 72, 78, 82]
    },
    {
      title: "Active Users",
      value: formatNumber(8420),
      change: 8.2,
      icon: Users,
      trend: [45, 52, 48, 61, 58, 65, 70]
    },
    {
      title: "Monthly Revenue",
      value: formatCurrency(2100000),
      change: 15.3,
      icon: TrendingUp,
      trend: [30, 35, 42, 38, 45, 48, 52]
    },
    {
      title: "Approval Rate",
      value: "87.5%",
      change: -2.1,
      icon: CheckCircle,
      trend: [85, 88, 86, 89, 87, 85, 88]
    }
  ]

  const recentActivities: Activity[] = [
    {
      id: "1",
      type: "loan_approved",
      description: "Loan application approved for John Smith",
      timestamp: "2 minutes ago",
      amount: "$25,000",
      status: "success"
    },
    {
      id: "2",
      type: "user_registered",
      description: "New user registration: Sarah Johnson",
      timestamp: "5 minutes ago",
      status: "success"
    },
    {
      id: "3",
      type: "payment_received",
      description: "Payment received from Michael Brown",
      timestamp: "12 minutes ago",
      amount: "$1,250",
      status: "success"
    },
    {
      id: "4",
      type: "loan_rejected",
      description: "Loan application rejected for David Wilson",
      timestamp: "18 minutes ago",
      amount: "$15,000",
      status: "failed"
    },
    {
      id: "5",
      type: "loan_approved",
      description: "Loan application under review for Emma Davis",
      timestamp: "25 minutes ago",
      amount: "$30,000",
      status: "pending"
    }
  ]

  const users: User[] = [
    {
      id: "1",
      name: "John Smith",
      email: "john.smith@email.com",
      status: "active",
      totalLoans: 3,
      creditScore: 750,
      joinDate: "Jan 15, 2024"
    },
    {
      id: "2",
      name: "Sarah Johnson",
      email: "sarah.j@email.com",
      status: "active",
      totalLoans: 1,
      creditScore: 680,
      joinDate: "Feb 20, 2024"
    },
    {
      id: "3",
      name: "Michael Brown",
      email: "m.brown@email.com",
      status: "pending",
      totalLoans: 0,
      creditScore: 720,
      joinDate: "Mar 10, 2024"
    },
    {
      id: "4",
      name: "Emma Davis",
      email: "emma.davis@email.com",
      status: "active",
      totalLoans: 2,
      creditScore: 790,
      joinDate: "Jan 30, 2024"
    },
    {
      id: "5",
      name: "David Wilson",
      email: "d.wilson@email.com",
      status: "inactive",
      totalLoans: 1,
      creditScore: 650,
      joinDate: "Dec 15, 2023"
    }
  ]

  // Chart data
  const loanAnalyticsData = [
    { month: "Jan", approved: 186, rejected: 45, pending: 23 },
    { month: "Feb", approved: 205, rejected: 52, pending: 31 },
    { month: "Mar", approved: 237, rejected: 38, pending: 28 },
    { month: "Apr", approved: 273, rejected: 41, pending: 35 },
    { month: "May", approved: 309, rejected: 47, pending: 29 },
    { month: "Jun", approved: 314, rejected: 39, pending: 33 }
  ];

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Credit-as-a-Service Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor your lending platform performance</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button className="flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>Export Report</span>
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <MetricCard key={index} {...metric} />
        ))}
      </div>

      {/* Charts and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loan Analytics Chart */}
        <Card className="p-6">
          <CardHeader className="flex flex-row items-center justify-between pb-6">
            <div>
              <CardTitle className="text-lg font-semibold">Loan Analytics</CardTitle>
              <p className="text-sm text-muted-foreground">Monthly loan application trends</p>
            </div>
            <Button variant="ghost" size="sm" aria-label="Filter data">
              <Filter className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={loanAnalyticsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <Tooltip />
                  <Bar dataKey="approved" fill={chartColors.approved} radius={4} />
                  <Bar dataKey="rejected" fill={chartColors.rejected} radius={4} />
                  <Bar dataKey="pending" fill={chartColors.pending} radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Recent Activities</CardTitle>
                <p className="text-sm text-muted-foreground">Latest platform activities</p>
              </div>
              <Button variant="link" size="sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[300px] overflow-y-auto">
              {recentActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Management Overview */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">User Management</CardTitle>
              <p className="text-sm text-muted-foreground">Manage platform users and their loan status</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <Button>Add User</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Total Loans</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Credit Score</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Join Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserTableRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FintechDashboardDemo() {
  return <FintechDashboard />
}
