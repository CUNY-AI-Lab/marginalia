/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  allowedDevOrigins: ['192.168.44.189'],
};

export default nextConfig;
