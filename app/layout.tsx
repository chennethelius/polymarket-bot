import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Live Trading Terminal',
  description: 'Real-time market analysis and trading',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
