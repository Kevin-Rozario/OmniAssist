'use client';

import Link from 'next/link';
import { useMe } from '@/lib/use-me';

const linkClassName
  = 'rounded-md px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none';

export function PrimaryNav() {
  const me = useMe();
  const showKnowledgeBase = me.data?.role === 'admin';

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
      <Link href="/" className={linkClassName}>
        Home
      </Link>
      {showKnowledgeBase
        ? (
            <Link href="/knowledge-base" className={linkClassName}>
              Knowledge Base
            </Link>
          )
        : null}
    </nav>
  );
}
