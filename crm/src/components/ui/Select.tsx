import React from 'react';

export default function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const base = 'w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20';
  return <select className={[base, className].join(' ')} {...props} />;
}


