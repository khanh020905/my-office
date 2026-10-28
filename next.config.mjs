// Next.js renders the page shell and bundles the office's code (Turbopack, in development and for builds).
// The server in front of it (server/index.mjs) handles the hooks, the live stream and the API.
//
// OFFICE_STATIC=1 builds the online demo instead (scripts/build-demo.mjs): a static export of the office in demo mode,
// in one language (OFFICE_STATIC_LANG), under OFFICE_BASE_PATH, into OFFICE_DIST_DIR.
const STATIC = process.env.OFFICE_STATIC === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,   // the office fills the screen; compile and runtime errors still show
  poweredByHeader: false,
  ...(STATIC && {
    output: 'export',
    basePath: process.env.OFFICE_BASE_PATH || '',
    distDir: process.env.OFFICE_DIST_DIR || 'out',
    trailingSlash: true,
    // scripts/build-demo.mjs builds from a copy inside the repo (so the live .next is left alone): resolve from the repo
    ...(process.env.OFFICE_TURBO_ROOT && { turbopack: { root: process.env.OFFICE_TURBO_ROOT } }),
  }),
  env: {
    NEXT_PUBLIC_OFFICE_STATIC: STATIC ? '1' : '',
    NEXT_PUBLIC_BASE_PATH: STATIC ? process.env.OFFICE_BASE_PATH || '' : '',
    // the demo site's root, where English lives; other languages are folders under it
    NEXT_PUBLIC_SITE_ROOT: STATIC ? process.env.OFFICE_SITE_ROOT || '' : '',
  },
};

export default nextConfig;
