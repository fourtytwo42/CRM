"use client";
import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}): JSX.Element {
  const base =
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black/40 dark:focus-visible:ring-white/40 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed';

  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  };

  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90',
    secondary:
      'bg-white text-black border border-black/10 hover:bg-black/5 dark:bg-gray-900 dark:text-white dark:border-white/10 dark:hover:bg-white/5',
    ghost:
      'bg-transparent text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/10',
    destructive:
      'bg-red-600 text-white hover:bg-red-600/90',
  };

  return (
    <button
      className={[base, sizes[size], variants[variant], className].join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}


