import { type FSWatcher, statSync, watch } from 'node:fs';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { harvestPaths } from './harvest';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_SEGMENTS = new Set(['node_modules', 'dist', '.git', '.gloss', 'fixtures']);

export const DEFAULT_DEBOUNCE_MS = 10_000;

export type Debouncer = {
  touch: (file: string) => void;
  pending: () => string[];
  dispose: () => void;
};

export const createDebouncer = (delayMs: number, onQuiet: (file: string) => void): Debouncer => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (file: string): void => {
    const timer = timers.get(file);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(file);
  };

  return {
    touch: (file) => {
      cancel(file);
      timers.set(
        file,
        setTimeout(() => {
          timers.delete(file);
          onQuiet(file);
        }, delayMs),
      );
    },
    pending: () => [...timers.keys()],
    dispose: () => {
      for (const file of [...timers.keys()]) cancel(file);
    },
  };
};

export type WatchOptions = {
  paths?: string[];
  debounceMs?: number;
  onHarvest?: (file: string, moved: number) => void;
};

export type WatchHandle = {
  close: () => void;
};

const toPosix = (path: string): string => path.split(sep).join('/');

const isHarvestable = (relPath: string): boolean => {
  if (relPath === '' || relPath.startsWith('..')) return false;
  if (!SOURCE_EXTENSIONS.has(extname(relPath))) return false;
  return !relPath.split('/').some((segment) => IGNORED_SEGMENTS.has(segment));
};

export const watchGloss = (repoRoot: string, options: WatchOptions = {}): WatchHandle => {
  const roots = (options.paths ?? [repoRoot]).map((path) =>
    isAbsolute(path) ? path : join(repoRoot, path),
  );
  const applying = new Set<string>();

  const harvest = (relPath: string): void => {
    applying.add(relPath);
    try {
      for (const harvested of harvestPaths(repoRoot, [relPath])) {
        options.onHarvest?.(harvested.file, harvested.moved);
      }
    } finally {
      setTimeout(() => applying.delete(relPath), 0);
    }
  };

  const debouncer = createDebouncer(options.debounceMs ?? DEFAULT_DEBOUNCE_MS, harvest);

  const schedule = (absolute: string): void => {
    const relPath = toPosix(relative(repoRoot, absolute));
    if (!isHarvestable(relPath) || applying.has(relPath)) return;
    debouncer.touch(relPath);
  };

  const watchers: FSWatcher[] = [];
  for (const root of roots) {
    const stats = statSync(root, { throwIfNoEntry: false });
    if (!stats) continue;
    if (stats.isFile()) {
      watchers.push(watch(root, () => schedule(root)));
      continue;
    }
    if (!stats.isDirectory()) continue;
    watchers.push(
      watch(root, { recursive: true }, (_event, name) => {
        if (name !== null) schedule(isAbsolute(name) ? name : join(root, name));
      }),
    );
  }

  return {
    close: () => {
      debouncer.dispose();
      for (const watcher of watchers) watcher.close();
    },
  };
};
