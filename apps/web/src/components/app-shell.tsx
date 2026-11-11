'use client';

import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { BrandMark } from '@/components/brand';
import { PrimaryNav } from '@/components/primary-nav';
import { ThemeMenu } from '@/components/theme-menu';
import { UserIdentity } from '@/components/user-identity';

/** Every page lives in this one centred column, so the navbar and content line up. */
const PAGE_WIDTH = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="z-40 shrink-0 border-b bg-background/70 backdrop-blur-xl">
        <div className={`${PAGE_WIDTH} flex flex-wrap items-center gap-x-6 gap-y-2 py-3 sm:min-h-16 sm:py-0`}>
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <BrandMark className="transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105" />
            <span className="text-base font-semibold tracking-tight">OmniAssist AI</span>
          </Link>
          <PrimaryNav className="order-last w-full sm:order-none sm:w-auto" />
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <UserIdentity />
            <ThemeMenu />
            <UserButton
              appearance={{
                elements: {
                  userButtonTrigger: 'rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                },
              }}
            />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className={`${PAGE_WIDTH} h-full`}>
          {children}
        </div>
      </main>
    </div>
  );
}
