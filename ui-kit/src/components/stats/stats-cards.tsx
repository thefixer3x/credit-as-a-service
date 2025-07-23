import * as React from 'react';
import { cn, formatCurrency, formatNumber, formatPercentage } from '../../lib/utils.js';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface CardProps extends React.ComponentProps<'div'> {}

function Card({ className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

interface CardHeaderProps extends React.ComponentProps<'div'> {}

function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

interface CardTitleProps extends React.ComponentProps<'div'> {}

function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

interface CardContentProps extends React.ComponentProps<'div'> {}

function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div data-slot="card-content" className={cn("px-6", className)} {...props} />
  );
}

export interface StatData {
  name: string;
  value: number;
  change: number;
  changeType: 'positive' | 'negative';
  format?: 'currency' | 'number' | 'percentage';
  currency?: string;
}

export interface StatsCardsProps {
  data: StatData[];
  className?: string;
}

export function StatsCards({ data, className }: StatsCardsProps) {
  const formatValue = (stat: StatData): string => {
    switch (stat.format) {
      case 'currency':
        return formatCurrency(stat.value, stat.currency);
      case 'percentage':
        return formatPercentage(stat.value, 2, false);
      case 'number':
      default:
        return formatNumber(stat.value);
    }
  };

  return (
    <div className={cn("flex items-center justify-center p-10", className)}>
      <div className="mx-auto grid grid-cols-1 gap-px rounded-xl bg-border sm:grid-cols-2 lg:grid-cols-4">
        {data.map((stat, index) => (
          <Card
            key={stat.name}
            className={cn(
              "rounded-none border-0 shadow-none py-0",
              index === 0 && "rounded-l-xl",
              index === data.length - 1 && "rounded-r-xl"
            )}
          >
            <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 p-4 sm:p-6">
              <div className="text-sm font-medium text-muted-foreground">
                {stat.name}
              </div>
              <div
                className={cn(
                  "text-xs font-medium flex items-center gap-1",
                  stat.changeType === "positive"
                    ? "text-green-800 dark:text-green-400"
                    : "text-red-800 dark:text-red-400"
                )}
              >
                {stat.changeType === "positive" ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {formatPercentage(stat.change)}
              </div>
              <div className="w-full flex-none text-3xl font-medium tracking-tight text-foreground">
                {formatValue(stat)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Default export for compatibility
export default StatsCards;