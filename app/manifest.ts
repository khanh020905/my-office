import type { MetadataRoute } from 'next';

// The office as an app on a phone's home screen ("Add to Home Screen"): full screen, its own icon. On an iPhone it is
// also what notifications need: Web Push reaches only a web app added to the home screen there (iOS 16.4 and later).
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Office', short_name: 'My Office', id: '/', start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
    background_color: '#0E131B', theme_color: '#0E131B',
    icons: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
