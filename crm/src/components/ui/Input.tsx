import React from 'react';

export default function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const base = 'w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20';
  return <input className={[base, className].join(' ')} {...props} />;
}


