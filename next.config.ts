import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  images: {
    remotePatterns: [
      new URL("https://my-store-id.public.blob.vercel-storage.com/**"),
    ],
  },
};

module.exports = nextConfig;
export default nextConfig;
