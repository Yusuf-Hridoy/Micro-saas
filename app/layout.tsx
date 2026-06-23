import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arborist Price Defenser',
  description: 'Live on-site tree service pricing calculator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-50 antialiased">{children}</body>
    </html>
  );
}
