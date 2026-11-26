import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './desktop-sync.css';
import './presentations.css';

export const metadata: Metadata = {
  title: {
    default: 'Edu Café Flow',
    template: '%s · Edu Café Flow'
  },
  applicationName: 'Edu Café Flow',
  description: 'Ambiente educacional protegido para aprender fazendo, com atividades, simuladores e colaboração por turma.',
  icons: { icon: '/branding/cafeflow-logo.png' }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B130D'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
