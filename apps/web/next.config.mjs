/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@little-readers/ui",
    "@little-readers/shared",
    "@little-readers/types",
    "@little-readers/validation",
    "@little-readers/config",
    "@little-readers/tenant",
  ],
};

export default nextConfig;
