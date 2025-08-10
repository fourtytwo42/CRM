"use client";
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export default function Dialog({ open, onOpenChange, title, children, className = '' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className={[
            'w-full max-w-md rounded-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-gray-900/95 shadow-xl',
            className,
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || title === '') && (
            <div className="px-5 pt-4 pb-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <div className="text-base font-semibold">{title}</div>
              <button
                aria-label="Close"
                className="h-8 w-8 rounded-md text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => onOpenChange(false)}
              >
                ×
              </button>
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-2">{children}</div>;
}


