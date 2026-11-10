import type { ReactNode } from 'react';
import { ThemeMenu } from '@/components/theme-menu';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-end p-4">
        <ThemeMenu />
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
