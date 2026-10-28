import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { getLang } from '@/i18n/server';
// One stylesheet per area of the screen, in cascade order (later files override earlier ones).
import '@/styles/fonts.css';
import '@/styles/base.css';
import '@/styles/topbar.css';
import '@/styles/topbar-plan.css';
import '@/styles/sidebars.css';
import '@/styles/activity.css';
import '@/styles/sessions.css';
import '@/styles/streamer.css';
import '@/styles/permissions.css';
import '@/styles/stage.css';
import '@/styles/labels.css';
import '@/styles/lite.css';
import '@/styles/timeline.css';
import '@/styles/places.css';
import '@/styles/todos.css';
import '@/styles/drawers.css';
import '@/styles/chat.css';
import '@/styles/mac.css';
import '@/styles/modal.css';
import '@/styles/replay.css';
import '@/styles/photo.css';
import '@/styles/tips.css';
import '@/styles/settings.css';
import '@/styles/responsive.css';

export const metadata: Metadata = {
  title: 'My Office',
  description: 'A 3D office for your Claude Code sessions.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-os: the machine's platform, for the words "Mac" / "PC" / "computer" (the online demo is a pretend Mac)
    <html lang={await getLang()} data-os={process.env.OFFICE_STATIC === '1' ? 'darwin' : process.platform}>
      <body>
        {children}
        {/* QR codes for "open on your phone" (qrcode.js, MIT), kept local so the office works offline */}
        <Script src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/assets/vendor/qrcode.min.js`} strategy="afterInteractive" />
      </body>
    </html>
  );
}
