import React from 'react';
import { X } from 'lucide-react';
import { IconButton } from './index';

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          <IconButton onClick={onClose} size="sm" aria-label="Fechar">
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="h-full w-full max-w-md border-l border-border bg-card p-6 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          <IconButton onClick={onClose} size="sm" aria-label="Fechar">
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
