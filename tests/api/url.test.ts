import { describe, expect, it } from 'vitest';
import {
  extractNodeIdFromUrl,
  normalizeFigmaUrl,
  normalizeNodeId,
  parseFigmaUrl,
} from '../../src/api/url.js';

describe('api/url', () => {
  it('should normalize node-id to colon format', () => {
    expect(normalizeNodeId('123-456')).toBe('123:456');
    expect(normalizeNodeId('123%3A456')).toBe('123:456');
  });

  it('should parse design URL', () => {
    const parsed = parseFigmaUrl('https://www.figma.com/design/ABC123/MyScreen?node-id=10-20');
    expect(parsed).toEqual({ fileKey: 'ABC123', nodeId: '10:20' });
  });

  it('should parse file URL without node-id', () => {
    const parsed = parseFigmaUrl('https://www.figma.com/file/ABC123/MyScreen');
    expect(parsed).toEqual({ fileKey: 'ABC123', nodeId: undefined });
  });

  it('should return null for invalid url', () => {
    expect(parseFigmaUrl('not-a-url')).toBeNull();
    expect(parseFigmaUrl('https://google.com/foo?node-id=1-2')).toBeNull();
  });

  it('should canonicalize URL with normalized node-id only', () => {
    const normalized = normalizeFigmaUrl('https://www.figma.com/design/ABC123/MyScreen?node-id=10-20&foo=bar');
    expect(normalized).toBe('https://www.figma.com/design/ABC123/MyScreen?node-id=10:20');
  });

  it('should extract node-id with fallback', () => {
    expect(extractNodeIdFromUrl('https://www.figma.com/design/ABC123?node-id=1-2')).toBe('1:2');
    expect(extractNodeIdFromUrl('https://www.figma.com/design/ABC123', 'missing')).toBe('missing');
  });
});
