import type { NextConfig } from 'next';

const desktopBuild = process.env.METALAB_DESKTOP_BUILD === '1';
const desktopDistDir = process.env.METALAB_DESKTOP_DIST_DIR || '.next-desktop-runtime';
if (desktopBuild && !/^\.next-desktop-[a-z0-9-]+$/u.test(desktopDistDir)) {
  throw new Error('METALAB_DESKTOP_DIST_DIR must be a local .next-desktop-* directory.');
}

const nextConfig: NextConfig = {
  ...(desktopBuild ? { output: 'standalone' as const } : {}),
  ...(desktopBuild ? { distDir: desktopDistDir } : {}),
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['zod']
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ...(desktopBuild ? [{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" }] : [])
      ]
    }];
  }
};

export default nextConfig;
