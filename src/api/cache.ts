/**
 * Cache for Figma API responses
 * Prevents redundant API calls and respects rate limits
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheKey {
  fileKey: string;
  nodeId?: string;
  endpoint: string;
}

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  version?: string;
  ttl: number;
}

export interface CacheOptions {
  cacheDir: string;
  defaultTtl?: number;
  enabled?: boolean;
}

export class FigmaCache {
  private cacheDir: string;
  private defaultTtl: number;
  private enabled: boolean;

  constructor(options: CacheOptions) {
    this.cacheDir = options.cacheDir;
    this.defaultTtl = options.defaultTtl ?? 5 * 60 * 1000;
    this.enabled = options.enabled ?? true;

    if (this.enabled && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCacheKey(key: CacheKey): string {
    const keyString = `${key.fileKey}:${key.nodeId ?? 'root'}:${key.endpoint}`;
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  private getCacheFilePath(key: CacheKey): string {
    const hash = this.getCacheKey(key);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  get<T>(key: CacheKey): T | null {
    if (!this.enabled) return null;

    const filePath = this.getCacheFilePath(key);

    try {
      if (!fs.existsSync(filePath)) return null;

      const content = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);

      const age = Date.now() - entry.timestamp;
      if (age > entry.ttl) {
        fs.unlinkSync(filePath);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: CacheKey, data: T, ttl?: number): void {
    if (!this.enabled) return;

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    };

    try {
      fs.writeFileSync(this.getCacheFilePath(key), JSON.stringify(entry), 'utf-8');
    } catch (error) {
      console.warn('Failed to write cache:', error);
    }
  }

  has(key: CacheKey): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: CacheKey): void {
    if (!this.enabled) return;

    try {
      const filePath = this.getCacheFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('Failed to invalidate cache:', error);
    }
  }

  clear(): void {
    if (!this.enabled) return;

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  stats(): { entries: number; size: number } {
    if (!this.enabled) return { entries: 0, size: 0 };

    try {
      if (!fs.existsSync(this.cacheDir)) return { entries: 0, size: 0 };

      const files = fs.readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'));
      let totalSize = 0;

      for (const file of files) {
        const stats = fs.statSync(path.join(this.cacheDir, file));
        totalSize += stats.size;
      }

      return { entries: files.length, size: totalSize };
    } catch {
      return { entries: 0, size: 0 };
    }
  }
}

export function createCache(cacheDir?: string): FigmaCache {
  const defaultCacheDir = cacheDir ?? path.join(process.cwd(), '.figma', '.cache');
  return new FigmaCache({ cacheDir: defaultCacheDir });
}
