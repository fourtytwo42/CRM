import React from 'react';

export default function Badge({ children, color = 'gray', className = '' }: { children: React.ReactNode; color?: 'gray'|'green'|'red'|'blue'|'yellow'; className?: string }) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  };
  return <span className={["inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full", colors[color], className].join(' ')}>{children}</span>;
}


