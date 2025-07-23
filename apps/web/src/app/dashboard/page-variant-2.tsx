// Dashboard Page Variant 2 - Generated Component Placeholder
// This file is a placeholder for the 21st.dev component generation API response
// Once the API responds with the component code, it will be placed here for review

/*
Expected Component Structure (Alternative Layout):
- Dashboard Overview Page with different layout approach
- Metrics Grid with enhanced visualizations
- Advanced Charts and Analytics
- Activity Feed with filters
- User Management Panel
- Alternative Fintech Design Patterns
*/

"use client"

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@caas/ui-kit'
import { Badge } from '@caas/ui-kit'
import { Button } from '@caas/ui-kit'
import { Progress } from '@caas/ui-kit'
import { cn } from '@/lib/utils'
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  CheckCircle, 
  CreditCard,
  Activity,
  Eye,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string
  change: string
  changeType: 'positive' | 'negative'
  icon: React.ReactNode
}

interface LoanActivity {
  id: string
  user: string
  amount: string
  status: 'approved' | 'pending' | 'rejected'
  date: string
  avatar: string
}

interface UserOverview {
  id: string
  name: string
  email: string
  totalLoans: number
  creditScore: number
  status: 'active' | 'inactive'
  avatar: string
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, changeType, icon }) => {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold text-foreground">{value}</p>
            </div>
          </div>
          <div className={cn(
            "flex items-center space-x-1 text-sm font-medium",
            changeType === 'positive' ? 'text-green-600' : 'text-red-600'
          )}>
            {changeType === 'positive' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            <span>{change}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const ChartCard: React.FC = () => {
  const chartData = [
    { month: 'Jan', loans: 120, revenue: 45000 },
    { month: 'Feb', loans: 150, revenue: 52000 },
    { month: 'Mar', loans: 180, revenue: 61000 },
    { month: 'Apr', loans: 165, revenue: 58000 },
    { month: 'May', loans: 200, revenue: 72000 },
    { month: 'Jun', loans: 220, revenue: 78000 }
  ]

  return (
    <Card>
      <CardHeader className="pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Loan Analytics</CardTitle>
          <Button variant="outline" size="sm">
            View Details
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {chartData.map((data, index) => (
            <div key={data.month} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-muted-foreground w-8">{data.month}</span>
                <div className="flex-1">
                  <Progress value={(data.loans / 250) * 100} className="h-2" />
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-foreground">{data.loans} loans</span>
                <span className="text-sm font-medium text-green-600">${data.revenue.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const RecentActivities: React.FC = () => {
  const activities: LoanActivity[] = [
    {
      id: '1',
      user: 'John Smith',
      amount: '$25,000',
      status: 'approved',
      date: '2 hours ago',
      avatar: 'JS'
    },
    {
      id: '2',
      user: 'Sarah Johnson',
      amount: '$15,000',
      status: 'pending',
      date: '4 hours ago',
      avatar: 'SJ'
    },
    {
      id: '3',
      user: 'Mike Davis',
      amount: '$30,000',
      status: 'approved',
      date: '6 hours ago',
      avatar: 'MD'
    },
    {
      id: '4',
      user: 'Emily Brown',
      amount: '$12,000',
      status: 'rejected',
      date: '8 hours ago',
      avatar: 'EB'
    },
    {
      id: '5',
      user: 'David Wilson',
      amount: '$20,000',
      status: 'pending',
      date: '1 day ago',
      avatar: 'DW'
    }
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>
      default:
        return <Badge>Unknown</Badge>
    }
  }

  return (
    <Card>
      <CardHeader className="pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Loan Activities</CardTitle>
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4 mr-2" />
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 flex items-center justify-center bg-primary/10 text-primary font-medium rounded-full">
                  {activity.avatar}
                </div>
                <div>
                  <p className="font-medium text-foreground">{activity.user}</p>
                  <p className="text-sm text-muted-foreground">{activity.date}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <span className="font-semibold text-foreground">{activity.amount}</span>
                {getStatusBadge(activity.status)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const UserManagement: React.FC = () => {
  const users: UserOverview[] = [
    {
      id: '1',
      name: 'Alice Cooper',
      email: 'alice@example.com',
      totalLoans: 3,
      creditScore: 750,
      status: 'active',
      avatar: 'AC'
    },
    {
      id: '2',
      name: 'Bob Martin',
      email: 'bob@example.com',
      totalLoans: 1,
      creditScore: 680,
      status: 'active',
      avatar: 'BM'
    },
    {
      id: '3',
      name: 'Carol White',
      email: 'carol@example.com',
      totalLoans: 5,
      creditScore: 820,
      status: 'inactive',
      avatar: 'CW'
    },
    {
      id: '4',
      name: 'Daniel Lee',
      email: 'daniel@example.com',
      totalLoans: 2,
      creditScore: 710,
      status: 'active',
      avatar: 'DL'
    }
  ]

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return 'text-green-600'
    if (score >= 650) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <Card>
      <CardHeader className="pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">User Management Overview</CardTitle>
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            Manage Users
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 flex items-center justify-center bg-primary/10 text-primary font-medium rounded-full">
                  {user.avatar}
                </div>
                <div>
                  <p className="font-medium text-foreground">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{user.totalLoans} loans</p>
                  <p className={`text-sm font-medium ${getCreditScoreColor(user.creditScore)}`}>
                    Score: {user.creditScore}
                  </p>
                </div>
                <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                  {user.status}
                </Badge>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const FintechDashboard: React.FC = () => {
  const metrics = [
    {
      title: 'Total Loans',
      value: '$2.4M',
      change: '+12.5%',
      changeType: 'positive' as const,
      icon: <CreditCard className="h-5 w-5 text-primary" />
    },
    {
      title: 'Active Users',
      value: '1,247',
      change: '+8.2%',
      changeType: 'positive' as const,
      icon: <Users className="h-5 w-5 text-primary" />
    },
    {
      title: 'Monthly Revenue',
      value: '$78,000',
      change: '+15.3%',
      changeType: 'positive' as const,
      icon: <DollarSign className="h-5 w-5 text-primary" />
    },
    {
      title: 'Approval Rate',
      value: '87.5%',
      change: '-2.1%',
      changeType: 'negative' as const,
      icon: <CheckCircle className="h-5 w-5 text-primary" />
    }
  ]

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Credit-as-a-Service Dashboard</h1>
            <p className="text-muted-foreground mt-1">Monitor your lending platform performance</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline">
              <Activity className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button>
              <TrendingUp className="h-4 w-4 mr-2" />
              View Analytics
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric, index) => (
            <MetricCard key={index} {...metric} />
          ))}
        </div>

        {/* Charts and Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard />
          <RecentActivities />
        </div>

        {/* User Management */}
        <UserManagement />
      </div>
    </div>
  )
}

export default FintechDashboard;
