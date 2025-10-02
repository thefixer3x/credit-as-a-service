import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface CreditScoreGaugeProps {
  score: number;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function CreditScoreGauge({
  score,
  maxScore = 850,
  size = 'md',
  showLabel = true,
  className
}: CreditScoreGaugeProps) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-32 h-32', 
    lg: 'w-40 h-40'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const getScoreColor = (score: number): string => {
    if (score >= 750) return 'text-green-600';
    if (score >= 650) return 'text-yellow-600';
    if (score >= 550) return 'text-orange-600';
    return 'text-red-600';
  };

  const getStrokeColor = (score: number): string => {
    if (score >= 750) return 'stroke-green-500';
    if (score >= 650) return 'stroke-yellow-500';
    if (score >= 550) return 'stroke-orange-500';
    return 'stroke-red-500';
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className={cn('relative', sizeClasses[size])}>
        <svg
          className="transform -rotate-90 w-full h-full"
          viewBox="0 0 100 100"
        >
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            className="text-gray-200 dark:text-gray-700"
          />
          
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={cn('transition-all duration-1000 ease-out', getStrokeColor(score))}
          />
        </svg>
        
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn('font-bold', textSizes[size], getScoreColor(score))}>
            {score}
          </div>
          <div className="text-xs text-muted-foreground">
            /{maxScore}
          </div>
        </div>
      </div>
      
      {showLabel && (
        <div className="mt-2 text-center">
          <div className="text-sm font-medium">Credit Score</div>
          <div className={cn('text-xs', getScoreColor(score))}>
            {score >= 750 ? 'Excellent' : 
             score >= 650 ? 'Good' : 
             score >= 550 ? 'Fair' : 'Poor'}
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditScoreGauge;