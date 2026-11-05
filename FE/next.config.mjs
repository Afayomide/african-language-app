/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    externalDir: true,
  },
  images: {
    unoptimized: true,
  },
  // Retired learner routes. Old links and bookmarks still land somewhere useful; the query
  // string (for example ?lessonId=...) is carried across automatically.
  async redirects() {
    return [
      { source: '/exercise', destination: '/study', permanent: false },
      { source: '/listening-exercise', destination: '/study', permanent: false },
      { source: '/sentence-builder', destination: '/study', permanent: false },
      { source: '/lesson-phrases', destination: '/lesson-expressions', permanent: false },
      // Standalone review was retired; personalised review lives in generated review lessons.
      { source: '/review', destination: '/dashboard', permanent: false },
    ]
  },
}

export default nextConfig
