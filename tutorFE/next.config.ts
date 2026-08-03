import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

// tutorFE shares FE's lesson-player codebase (single source of truth) rather than keeping its
// own copy. Two things are needed to make that work under Next 16 / Turbopack:
//
// 1. Reach FE's files, which live OUTSIDE tutorFE. Turbopack won't resolve modules outside its
//    root, so `turbopack.root` is widened to the repo root. (`experimental.externalDir` is
//    webpack-only and does nothing for Turbopack.)
//
// 2. Dedupe shared deps. Once FE's files are in the graph they'd otherwise resolve `react` /
//    `react-dom` / `lucide-react` from FE's OWN node_modules — a second copy of React, which
//    both bloats compilation and causes "Invalid hook call" at runtime. We alias those onto
//    tutorFE's single installed copy so there's exactly one of each.
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const nodeModules = path.resolve(currentDir, 'node_modules')
const lessonPlayerDir = path.resolve(currentDir, '../FE/shared/lesson-player')

// Turbopack's resolveAlias treats each value as an import specifier and does NOT accept
// absolute Windows paths (it fails with "windows imports are not implemented yet"). Values
// must be paths RELATIVE to turbopack.root (= repoRoot). Express every alias target that way.
const relFromRoot = (absPath: string) => './' + path.relative(repoRoot, absPath).split(path.sep).join('/')

const turbopackAlias: Record<string, string> = {
  '@lesson-player': relFromRoot(lessonPlayerDir),
  react: relFromRoot(path.join(nodeModules, 'react')),
  'react-dom': relFromRoot(path.join(nodeModules, 'react-dom')),
  'react/jsx-runtime': relFromRoot(path.join(nodeModules, 'react/jsx-runtime.js')),
  'react/jsx-dev-runtime': relFromRoot(path.join(nodeModules, 'react/jsx-dev-runtime.js')),
  'lucide-react': relFromRoot(path.join(nodeModules, 'lucide-react')),
}

// webpack accepts absolute paths just fine, so keep the absolute form for that fallback path.
const webpackAlias: Record<string, string> = {
  '@lesson-player': lessonPlayerDir,
  react: path.join(nodeModules, 'react'),
  'react-dom': path.join(nodeModules, 'react-dom'),
  'react/jsx-runtime': path.join(nodeModules, 'react/jsx-runtime.js'),
  'react/jsx-dev-runtime': path.join(nodeModules, 'react/jsx-dev-runtime.js'),
  'lucide-react': path.join(nodeModules, 'lucide-react'),
}

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  reactCompiler: true,
  turbopack: {
    // Repo root so Turbopack may resolve sibling packages (FE) that live outside tutorFE.
    root: repoRoot,
    resolveAlias: turbopackAlias,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...webpackAlias,
    }
    return config
  },
}

export default nextConfig
