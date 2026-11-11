import type { ReactNode } from 'react';

/** A template remounts on every navigation, so each page eases in. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="h-full animate-in duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      {children}
    </div>
  );
}
