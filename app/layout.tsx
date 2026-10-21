import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider, themeBootstrapScript } from './lib/theme';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pointy Wizard',
  description: 'A visual editor for Pointy-Lang pipelines.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the bootstrap script mutates the class list
    // before React hydrates, which is the whole point of it.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${dmSans.variable} ${dmMono.variable} bg-bg-base text-primary`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
