import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand';
import { ThemeMenu } from '@/components/theme-menu';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">OmniAssist AI</span>
        </div>
        <ThemeMenu />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-8 animate-in duration-700 fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}
