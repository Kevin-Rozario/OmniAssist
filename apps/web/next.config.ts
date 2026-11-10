import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@omni/ui', '@omni/types'],
};

export default nextConfig;
