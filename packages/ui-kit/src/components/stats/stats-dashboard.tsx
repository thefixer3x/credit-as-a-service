import * as React from 'react';
import { cn, formatCurrency } from '../../lib/utils';
import { ArrowUpRight, Users, CreditCard, DollarSign, TrendingUp } from 'lucide-react';

interface CardProps extends React.ComponentProps<'div'> {}

function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps extends React.ComponentProps<'div'> {}

function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

interface CardTitleProps extends React.ComponentProps<'h3'> {}

function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

interface CardContentProps extends React.ComponentProps<'div'> {}

function CardContent({ className, ...props }: CardContentProps) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export interface DashboardStat {
  title: string;
  value: number;
  change: number;
  changeLabel: string;
  icon: React.ReactNode;
  format?: 'currency' | 'number' | 'percentage';
  currency?: string;
}

export interface StatsDashboardProps {
  stats: DashboardStat[];
  className?: string;
  columns?: 2 | 3 | 4;
}

export function StatsDashboard({ 
  stats, 
  className,
  columns = 4
}: StatsDashboardProps) {
  const formatValue = (stat: DashboardStat): string => {
    switch (stat.format) {
      case 'currency':
        return formatCurrency(stat.value, stat.currency);
      case 'percentage':
        return `${stat.value.toFixed(1)}%`;
      case 'number':
      default:
        return stat.value.toLocaleString();
    }
  };

  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4'
  }[columns];

  return (
    <div className={cn(`grid gap-6 w-full ${gridClass}`, className)}>
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <div className="h-4 w-4 text-muted-foreground">
              {stat.icon}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatValue(stat)}
            </div>
            <div className={cn(
              "flex items-center pt-1 text-xs",
              stat.change >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {stat.change >= 0 ? (
                <ArrowUpRight className="mr-1 h-3 w-3" />
              ) : (
                <ArrowUpRight className="mr-1 h-3 w-3 rotate-90" />
              )}
              <span>{stat.changeLabel}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Pre-configured fintech dashboard stats
export const defaultFintechStats: DashboardStat[] = [
  {
    title: "Total Revenue",
    value: 45231.89,
    change: 20.1,
    changeLabel: "+20.1% from last month",
    icon: <DollarSign className="h-4 w-4" />,
    format: 'currency'
  },
  {
    title: "Active Users",
    value: 2350,
    change: 18.2,
    changeLabel: "+18.2% from last month",
    icon: <Users className="h-4 w-4" />,
    format: 'number'
  },
  {
    title: "Loans Disbursed",
    value: 1284000,
    change: 12.5,
    changeLabel: "+12.5% from last month",
    icon: <CreditCard className="h-4 w-4" />,
    format: 'currency'
  },
  {
    title: "Default Rate",
    value: 2.3,
    change: -0.8,
    changeLabel: "-0.8% from last month",
    icon: <TrendingUp className="h-4 w-4" />,
    format: 'percentage'
  }
];

// Default export for compatibility
export default StatsDashboard;