'use client';

import { Button } from '@omni/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@omni/ui/components/dropdown-menu';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

const themes = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Theme"
          className="border-0 shadow-none outline-none hover:bg-foreground/10 focus-visible:border-transparent focus-visible:ring-0 dark:hover:bg-foreground/10"
        >
          <SunIcon className="dark:hidden" aria-hidden="true" />
          <MoonIcon className="hidden dark:inline" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={theme ?? 'system'}
          onValueChange={setTheme}
        >
          {themes.map(option => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
