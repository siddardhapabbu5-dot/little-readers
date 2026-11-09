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
  async redirects() {
    const aliases = {
      "/privacy-policy": "/privacy",
      "/terms-and-conditions": "/terms",
      "/terms-of-service": "/terms",
      "/refund": "/refund-policy",
      "/refunds": "/refund-policy",
      "/cancellation": "/refund-policy",
      "/cancellation-policy": "/refund-policy",
      "/shipping": "/shipping-policy",
      "/delivery": "/shipping-policy",
      "/delivery-policy": "/shipping-policy",
      "/contact-us": "/contact",
      "/about-us": "/about",
      "/plans": "/pricing",
    };
    return Object.entries(aliases).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
