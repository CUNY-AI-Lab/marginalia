/** @type {import('next').NextConfig} */
// Static export served by the cail-marginalia Worker under Doorway's /marginalia mount.
const nextConfig = {
  output: 'export',
  outputFileTracingRoot: import.meta.dirname,
  basePath: '/marginalia',
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: '/marginalia' },
};

export default nextConfig;
