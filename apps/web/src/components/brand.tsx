import { cn } from '@omni/ui/lib/utils';
import { SparklesIcon } from 'lucide-react';

/** The OmniAssist mark: a soft gradient tile with a spark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0  rounded-xl bg-linear-to-br from-primary to-primary/60 text-primary-foreground shadow-sm ring-1 ring-primary/20 [&>svg]:size-[55%]',
        className,
      )}
    >
      <SparklesIcon />
    </span>
  );
}
