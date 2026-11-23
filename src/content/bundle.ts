/**
 * Vite-only glue: bundles every level file at build time (F-901, F-902).
 * Kept apart from load.ts so the rest of src/content runs in plain Node.
 */
const modules = import.meta.glob('../../content/levels/*.json', {
  eager: true,
  import: 'default',
});

export function bundledLevelFiles(): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const [path, content] of Object.entries(modules)) {
    files[path.split('/').pop() ?? path] = content;
  }
  return files;
}
