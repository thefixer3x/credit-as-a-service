import * as React from 'react';
import { cn, formatNumber } from '../../lib/utils';
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';

export interface StatisticData {
  title: string;
  value: number;
  delta: number;
  lastMonth: number;
  positive: boolean;
  prefix?: string;
  suffix?: string;
  format?: (v: number) => string;
  lastFormat?: (v: number) => string;
  bg: string;
  svg?: React.ReactNode;
}

export interface StatisticsCardProps {
  stats: StatisticData[];
  className?: string;
  showActions?: boolean;
}

function Badge({ 
  className, 
  children,
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 bg-white/20 font-semibold text-xs px-2 py-1 rounded",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function StatisticsCard({ 
  stats, 
  className,
  showActions = false 
}: StatisticsCardProps) {
  return (
    <div className={cn("min-h-screen flex items-center justify-center p-6 lg:p-8", className)}>
      <div className="grow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div 
            key={index} 
            className={cn("relative overflow-hidden rounded-xl text-white p-6", stat.bg)}
          >
            {/* Background SVG */}
            {stat.svg && (
              <div className="absolute inset-0 pointer-events-none">
                {stat.svg}
              </div>
            )}
            
            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-4">
              <h3 className="text-white/90 text-sm font-medium">{stat.title}</h3>
              {showActions && (
                <button className="text-white/80 hover:text-white p-1 rounded">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="relative z-10 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-semibold tracking-tight">
                  {stat.format ? stat.format(stat.value) : stat.prefix + formatNumber(stat.value) + stat.suffix}
                </span>
                <Badge>
                  {stat.delta > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {stat.delta}%
                </Badge>
              </div>
              <div className="text-xs text-white/80 mt-2 border-t border-white/20 pt-2.5">
                Vs last month:{' '}
                <span className="font-medium text-white">
                  {stat.lastFormat
                    ? stat.lastFormat(stat.lastMonth)
                    : stat.prefix + formatNumber(stat.lastMonth) + stat.suffix}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Default export for compatibility
export default StatisticsCard;