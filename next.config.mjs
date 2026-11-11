/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Backend URL for the browser, baked in at build time. Only NEXT_PUBLIC_* names reach client code on their own,
  // so NEXT_API_URL is exposed here. NEXT_PUBLIC_API_URL is still read for older setups.
  env: {
    NEXT_API_URL: process.env.NEXT_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
};

export default nextConfig;
