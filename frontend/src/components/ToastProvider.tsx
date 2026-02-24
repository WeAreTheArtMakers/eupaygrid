'use client';

import { createContext, useContext, useMemo, useState } from 'react';

type Toast = {
  id: number;
  kind: 'success' | 'error';
  message: string;
};

type ToastContextValue = {
  pushSuccess: (message: string) => void;
  pushError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function useToastState(): [Toast[], (toast: Toast) => void, (id: number) => void] {
  const [items, setItems] = useState<Toast[]>([]);

  const add = (toast: Toast) => {
    setItems((prev) => [...prev, toast]);
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== toast.id));
    }, 3200);
  };

  const remove = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return [items, add, remove];
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [items, add, remove] = useToastState();

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      pushSuccess(message: string) {
        add({ id: Date.now() + Math.floor(Math.random() * 1000), kind: 'success', message });
      },
      pushError(message: string) {
        add({ id: Date.now() + Math.floor(Math.random() * 1000), kind: 'error', message });
      }
    }),
    [add]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed right-4 top-16 z-50 flex w-[340px] flex-col gap-2">
        {items.map((toast) => (
          <button
            key={toast.id}
            onClick={() => remove(toast.id)}
            className={`rounded-md border px-3 py-2 text-left text-sm shadow-soft transition ${
              toast.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToasts must be used inside ToastProvider');
  }
  return ctx;
}
