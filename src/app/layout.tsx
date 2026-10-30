import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './presentations.css';

export const metadata: Metadata = {
  title: {
    default: 'MetaLab Pocket',
    template: '%s · MetaLab Pocket'
  },
  description: 'Laboratório educacional protegido para praticar negócios, fotografia e comunicação digital.',
  icons: { icon: '/simulator/assets/metalab-logo.png' }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1D1230'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
