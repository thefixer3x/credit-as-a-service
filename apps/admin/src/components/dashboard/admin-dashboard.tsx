"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit';
import { Badge } from '@caas/ui-kit';
import { Button } from '@caas/ui-kit';
import {
  Users,
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Shield,
  Activity,
  Database,
  Server,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Settings,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminMetric {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
  alert?: boolean;
}

interface SystemAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  resolved: boolean;
}

interface RecentAdminActivity {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
}

const AdminMetricCard: React.FC<{ metric: AdminMetric }> = ({ metric }) => {
  const Icon = metric.icon;
  
  return (
    <Card className={cn("relative", metric.alert && "border-red-200 bg-red-50/50")}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "p-3 rounded-lg",
              metric.alert 
                ? "bg-red-100 text-red-600" 
                : "bg-gray-100 text-gray-600"
            )}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{metric.title}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{metric.value}</p>
            </div>
          </div>
          {metric.change && (
            <div className={cn(
              "text-right",
              metric.changeType === 'positive' && "text-green-600",
              metric.changeType === 'negative' && "text-red-600",
              metric.changeType === 'neutral' && "text-gray-600"
            )}>
              <p className="text-sm font-medium">{metric.change}</p>
              <p className="text-xs text-muted-foreground">vs last period</p>
            </div>
          )}
        </div>
        {metric.alert && (
          <div className="absolute top-2 right-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SystemAlertItem: React.FC<{ alert: SystemAlert }> = ({ alert }) => {
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'info': return <CheckCircle className="h-4 w-4 text-blue-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical': return 'border-red-200 bg-red-50';
      case 'warning': return 'border-yellow-200 bg-yellow-50';
      case 'info': return 'border-blue-200 bg-blue-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className={cn("p-3 rounded-lg border", getAlertColor(alert.type))}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="mt-0.5">
            {getAlertIcon(alert.type)}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{alert.message}</p>
            <div className="flex items-center space-x-2 mt-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{alert.timestamp}</p>
            </div>
          </div>
        </div>
        {alert.resolved ? (
          <Badge variant="secondary" className="text-xs">Resolved</Badge>
        ) : (
          <Button variant="outline" size="sm" className="text-xs">
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
        )}
      </div>
    </div>
  );
};

const AdminActivityItem: React.FC<{ activity: RecentAdminActivity }> = ({ activity }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          {getStatusIcon(activity.status)}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {activity.user} {activity.action}
          </p>
          <p className="text-sm text-muted-foreground">{activity.target}</p>
          <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
        </div>
      </div>
      <Badge 
        variant={activity.status === 'success' ? 'default' : 
                activity.status === 'failed' ? 'destructive' : 'secondary'}
        className="text-xs"
      >
        {activity.status}
      </Badge>
    </div>
  );
};

export function AdminDashboard() {
  const adminMetrics: AdminMetric[] = [
    {
      title: "Total Users",
      value: "23,847",
      change: "+12.5%",
      changeType: "positive",
      icon: Users
    },
    {
      title: "Active Loans",
      value: "4,362",
      change: "+8.2%",
      changeType: "positive",
      icon: CreditCard
    },
    {
      title: "System Uptime",
      value: "99.9%",
      change: "-0.1%",
      changeType: "negative",
      icon: Server,
      alert: true
    },
    {
      title: "Total Revenue",
      value: "$1.2M",
      change: "+15.3%",
      changeType: "positive",
      icon: DollarSign
    },
    {
      title: "Failed Transactions",
      value: "127",
      change: "+23.4%",
      changeType: "negative",
      icon: AlertTriangle,
      alert: true
    },
    {
      title: "API Requests",
      value: "2.1M",
      change: "+7.8%",
      changeType: "positive",
      icon: Activity
    }
  ];

  const systemAlerts: SystemAlert[] = [
    {
      id: "1",
      type: "critical",
      message: "High CPU usage detected on loan processing servers (>85%)",
      timestamp: "2 minutes ago",
      resolved: false
    },
    {
      id: "2",
      type: "warning", 
      message: "Database connection pool approaching limit (78/100)",
      timestamp: "15 minutes ago",
      resolved: false
    },
    {
      id: "3",
      type: "info",
      message: "Scheduled maintenance completed successfully",
      timestamp: "1 hour ago", 
      resolved: true
    },
    {
      id: "4",
      type: "warning",
      message: "Unusual spike in loan application rejections (+45%)",
      timestamp: "3 hours ago",
      resolved: false
    }
  ];

  const recentActivities: RecentAdminActivity[] = [
    {
      id: "1",
      user: "John Admin",
      action: "approved loan application",
      target: "Loan ID: LN-2024-001847",
      timestamp: "5 minutes ago",
      status: "success"
    },
    {
      id: "2", 
      user: "Sarah Manager",
      action: "updated user permissions",
      target: "User: jane.smith@email.com",
      timestamp: "12 minutes ago",
      status: "success"
    },
    {
      id: "3",
      user: "Mike Support",
      action: "attempted system config change",
      target: "API Rate Limits",
      timestamp: "18 minutes ago",
      status: "failed"
    },
    {
      id: "4",
      user: "Lisa Admin",
      action: "generated compliance report",
      target: "Monthly KYC Report",
      timestamp: "1 hour ago",
      status: "success"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <span>Admin Dashboard</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Enterprise system monitoring and management console
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
          <Button>
            <Settings className="h-4 w-4 mr-2" />
            System Config
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminMetrics.map((metric, index) => (
          <AdminMetricCard key={index} metric={metric} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Alerts */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span>System Alerts</span>
              </CardTitle>
              <Badge variant="destructive" className="text-xs">
                3 Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
              {systemAlerts.map((alert) => (
                <SystemAlertItem key={alert.id} alert={alert} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Admin Activity */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Recent Admin Activity</span>
              </CardTitle>
              <Button variant="link" size="sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto">
              {recentActivities.map((activity) => (
                <AdminActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>System Health Overview</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: "API Gateway", status: "healthy", uptime: "99.9%" },
              { label: "Database", status: "warning", uptime: "99.7%" },
              { label: "Auth Service", status: "healthy", uptime: "100%" },
              { label: "Payment Processing", status: "healthy", uptime: "99.8%" }
            ].map((service, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{service.label}</span>
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    service.status === 'healthy' ? "bg-green-500" : "bg-yellow-500"
                  )} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Uptime: {service.uptime}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}