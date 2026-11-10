'use client';

import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@omni/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@omni/ui/components/sheet';
import { MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { PrimaryNav } from '@/components/primary-nav';
import { ThemeMenu } from '@/components/theme-menu';
import { UserIdentity } from '@/components/user-identity';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="shrink-0 md:hidden" aria-label="Open navigation">
              <MenuIcon aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription className="sr-only">Primary navigation links</SheetDescription>
            </SheetHeader>
            <PrimaryNav />
          </SheetContent>
        </Sheet>
        <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight">
          OmniAssist
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <UserIdentity />
          <ThemeMenu />
          <UserButton
            appearance={{
              elements: {
                userButtonTrigger: 'rounded-full focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
              },
            }}
          />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r md:block">
          <PrimaryNav />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
