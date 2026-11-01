import type { Metadata } from 'next';
import { AuthBootstrap } from '@/components/auth-bootstrap';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatPlate — Dashboard',
  description: 'ChatPlate: WhatsApp ordering and order management for restaurants',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions inject attributes into <html>/<body>
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 text-white antialiased" suppressHydrationWarning>
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
