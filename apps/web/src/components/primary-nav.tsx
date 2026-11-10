import Link from 'next/link';

export function PrimaryNav() {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
      <Link
        href="/"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        Home
      </Link>
    </nav>
  );
}
