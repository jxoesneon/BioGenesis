import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = path.resolve(__filename, '..', '..', '..');

export const EXCLUDED_DIRS = new Set<string>([
  'node_modules',
  '.git',
  '.ciel',
  'dist',
  '.playwright-mcp',
  '.fastembed_cache',
  'coverage',
]);

export const EXCLUDED_FILES = new Set<string>(['.DS_Store', 'package-lock.json']);

export function toProjectPath(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('A non-empty path string is required');
  }
  const resolved = path.isAbsolute(input)
    ? path.normalize(input)
    : path.resolve(PROJECT_ROOT, input);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${input}`);
  }
  return resolved;
}

export function isExcluded(filePath: string, root: string = PROJECT_ROOT): boolean {
  const relative = path.relative(root, filePath);
  const parts = relative.split(path.sep);
  return (
    parts.some((part) => EXCLUDED_DIRS.has(part)) ||
    EXCLUDED_FILES.has(path.basename(filePath))
  );
}

export function isWithinProject(filePath: string): boolean {
  try {
    toProjectPath(filePath);
    return true;
  } catch {
    return false;
  }
}
