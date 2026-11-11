import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Splash } from '@/components/splash';
import { ThemeScript } from '@/components/theme-script';
import { env } from '@/env';
import './globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata = {
  title: 'OmniAssist AI',
  description: 'IT support copilot',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh font-sans antialiased suppressHydrationWarning">
        <ThemeScript />
        <Splash />
        <ClerkProvider
          publishableKey={env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={{
            variables: { colorPrimary: '#5b50e0', borderRadius: '0.75rem' },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
