'use client';

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@omni/ui/components/navigation-menu';
import { cn } from '@omni/ui/lib/utils';
import { LibraryIcon, MessageSquareIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/use-me';

const linkClassName
  = 'flex-row items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:shadow-xs [&_svg]:size-4';

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <NavigationMenuItem>
      <NavigationMenuLink asChild active={active} className={linkClassName}>
        <Link href={href} aria-current={active ? 'page' : undefined}>
          {children}
        </Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
}

export function PrimaryNav({ className }: { className?: string }) {
  const me = useMe();
  const pathname = usePathname();
  const showKnowledgeBase = me.data?.role === 'admin';

  return (
    <NavigationMenu aria-label="Primary" viewport={false} className={cn('max-w-none flex-none justify-start', className)}>
      <NavigationMenuList className="gap-1">
        <NavLink href="/" active={pathname === '/'}>
          <MessageSquareIcon aria-hidden="true" />
          Chat
        </NavLink>
        {showKnowledgeBase
          ? (
              <NavLink href="/knowledge-base" active={pathname.startsWith('/knowledge-base')}>
                <LibraryIcon aria-hidden="true" />
                Knowledge Base
              </NavLink>
            )
          : null}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
