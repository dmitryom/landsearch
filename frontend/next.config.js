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
      {
        source: '/tiles/roads/:path*',
        destination: 'https://tiles.openfreemap.org/planet/:path*',
      },
      {
        source: '/tiles/esri/imagery/:z/:y/:x',
        destination: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/:z/:y/:x',
      },
      {
        source: '/tiles/esri/labels/:z/:y/:x',
        destination: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/:z/:y/:x',
      },
      {
        source: '/tiles/carto/labels/:path*',
        destination: 'https://a.basemaps.cartocdn.com/light_only_labels/:path*',
      },
      {
        source: '/tiles/carto/light/:path*',
        destination: 'https://a.basemaps.cartocdn.com/light_all/:path*',
      },
      {
        source: '/tiles/carto/dark/:path*',
        destination: 'https://a.basemaps.cartocdn.com/dark_all/:path*',
      },
      {
        source: '/tiles/carto/voyager/:path*',
        destination: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/:path*',
      },
      {
        source: '/tiles/osm/:z/:x/:y.png',
        destination: 'https://tile.openstreetmap.org/:z/:x/:y.png',
      },
      {
        source: '/tiles/topo/:z/:x/:y.png',
        destination: 'https://a.tile.opentopomap.org/:z/:x/:y.png',
      },
      {
        source: '/tiles/cyclosm/:z/:x/:y.png',
        destination: 'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/:z/:x/:y.png',
      },
    ]
  },
}

module.exports = nextConfig
