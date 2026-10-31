/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@safi/ui', '@safi/types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.yourdomain.com' },
    ],
  },
};

module.exports = nextConfig;
