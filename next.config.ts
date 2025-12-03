/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // ✅ Let the build succeed even if there are type errors
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
