import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

function readCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Building from a tarball without git metadata is legitimate; the UI then shows "unknown".
    return 'unknown';
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Relative base so the same build works under any GitHub Pages sub-path.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(readCommit()),
  },
  build: {
    target: 'es2022',
    // Three.js is one lazily loaded chunk of about 135 kB gzipped; the default 500 kB (raw) warning is noise here.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/content/**', 'src/storage/**', 'src/logging/**'],
      // bundle.ts only wires Vite's import.meta.glob; console-sink.ts only forwards to console.
      exclude: ['src/content/bundle.ts', 'src/logging/console-sink.ts'],
      thresholds: { lines: 90, branches: 90 },
      reporter: ['text-summary', 'text'],
    },
  },
});
