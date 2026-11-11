import { BrandMark } from '@/components/brand';

const NAME = 'OmniAssist AI';

/**
 * Shown over the first paint of every full page load: the name rises in letter by
 * letter, then the veil fades away to reveal the sign-in page or the chat. It is plain
 * CSS (see `.splash` in globals.css), so it never blocks the page if scripts are slow.
 */
export function Splash() {
  return (
    <div
      aria-hidden="true"
      data-testid="splash"
      className="splash pointer-events-none fixed inset-0 z-100 grid place-items-center bg-background"
    >
      <div className="flex flex-col items-center gap-5">
        <BrandMark className="splash-char size-14 rounded-2xl" />
        <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {NAME.split('').map((char, index) => (
            <span
              // The name is a fixed string, so position is a stable key.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="splash-char"
              style={{ animationDelay: `${0.25 + index * 0.05}s` }}
            >
              {char === ' '
                ? '\u00A0'
                : char}
            </span>
          ))}
        </p>
        <span className="splash-line h-0.5 w-24 rounded-full bg-linear-to-r from-primary to-primary/0" />
      </div>
    </div>
  );
}
