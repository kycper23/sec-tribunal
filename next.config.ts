import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The shared src/ modules use NodeNext-style ".js" import specifiers so the
  // tsx CLI keeps working; teach the bundler to resolve them to .ts sources.
  webpack: (config) => {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }
    return config
  },
}

export default nextConfig
