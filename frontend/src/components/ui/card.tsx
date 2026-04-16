import * as React from 'react';
import cn from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4 border-b border-border', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}
