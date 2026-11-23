import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LEVEL_DIR = join(import.meta.dirname, '..', 'content', 'levels');

/** All level files as raw JSON text, keyed by file name. */
export function readLevelFiles(dir: string = LEVEL_DIR): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith('.json')) files[name] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}
