/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/settlement-map-glyphs/:path*',
        destination: 'https://demotiles.maplibre.org/font/:path*',
      },
    ]
  },
}

module.exports = nextConfig
