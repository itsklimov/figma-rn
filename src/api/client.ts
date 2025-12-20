/**
 * Figma API Client - Thin wrapper around figma-api library
 */

import * as Figma from 'figma-api';
import type {
  ParsedFigmaUrl,
  FetchNodesResult,
  TransformedNode,
  ImageExportOptions,
  ImageExportResult,
  VariablesResult,
  StylesResult,
  FigmaStyle,
} from './types.js';
import { FigmaApiError, createApiError } from './errors.js';

export class FigmaClient {
  private api: Figma.Api;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.api = new Figma.Api({ personalAccessToken: token });
  }

  /**
   * Parse Figma URL to extract fileKey and nodeId
   * Supports: figma.com/file/KEY, figma.com/design/KEY
   * Extracts node-id query param and converts dashes to colons
   */
  parseUrl(url: string): ParsedFigmaUrl {
    try {
      const urlObj = new URL(url);

      // Extract file key from pathname
      // Supports: /file/KEY, /design/KEY
      const pathMatch = urlObj.pathname.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
      if (!pathMatch) {
        throw new FigmaApiError('Invalid Figma URL: could not extract file key', 'INVALID_URL');
      }

      const fileKey = pathMatch[2];

      // Extract and transform node-id from query params
      // Figma URLs use dashes (node-id=1-2) but API requires colons (1:2)
      const nodeIdParam = urlObj.searchParams.get('node-id');
      const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ':') : undefined;

      return { fileKey, nodeId };
    } catch (error) {
      if (error instanceof FigmaApiError) throw error;
      throw createApiError(error);
    }
  }

  /**
   * Fetch nodes from Figma API
   */
  async fetchNodes(fileKey: string, nodeIds: string[]): Promise<FetchNodesResult> {
    try {
      const response = await this.api.getFileNodes(
        { file_key: fileKey },
        { ids: nodeIds.join(',') }
      );

      // Transform nodes - preserve raw document for extraction
      const transformedNodes: Record<string, TransformedNode> = {};
      for (const [nodeId, nodeData] of Object.entries(response.nodes)) {
        if (nodeData) {
          const doc = (nodeData as any).document;
          transformedNodes[nodeId] = {
            id: nodeId,
            name: doc?.name || 'Unnamed',
            type: doc?.type || 'UNKNOWN',
            document: doc,
            metadata: doc?.absoluteBoundingBox ? {
              width: doc.absoluteBoundingBox.width,
              height: doc.absoluteBoundingBox.height,
              x: doc.absoluteBoundingBox.x,
              y: doc.absoluteBoundingBox.y,
            } : undefined,
          };
        }
      }

      return {
        nodes: transformedNodes,
        fileKey,
        rawResponse: response,
      };
    } catch (error) {
      throw createApiError(error);
    }
  }

  /**
   * Fetch a node by Figma URL
   */
  async fetchNodeByUrl(url: string): Promise<FetchNodesResult> {
    const parsed = this.parseUrl(url);

    if (!parsed.nodeId) {
      throw new FigmaApiError('URL must contain a node-id parameter', 'INVALID_URL');
    }

    return this.fetchNodes(parsed.fileKey, [parsed.nodeId]);
  }

  /**
   * Export nodes as images
   */
  async exportImages(
    fileKey: string,
    nodeIds: string[],
    options?: ImageExportOptions
  ): Promise<ImageExportResult[]> {
    try {
      const queryParams: any = {
        ids: nodeIds.join(','),
        format: options?.format || 'png',
        scale: options?.scale || 1,
      };

      if (options?.svgOptions?.svgIdAttribute !== undefined) {
        queryParams.svg_include_id = options.svgOptions.svgIdAttribute;
      }
      if (options?.svgOptions?.svgSimplifyStroke !== undefined) {
        queryParams.svg_simplify_stroke = options.svgOptions.svgSimplifyStroke;
      }

      const response = await this.api.getImages({ file_key: fileKey }, queryParams);

      const results: ImageExportResult[] = [];
      for (const nodeId of nodeIds) {
        const url = response.images[nodeId];
        if (url) {
          results.push({ nodeId, url });
        } else {
          results.push({
            nodeId,
            url: '',
            error: (response as any).err || 'Failed to export image',
          });
        }
      }

      return results;
    } catch (error) {
      throw createApiError(error);
    }
  }

  /**
   * Fetch variables from Figma file
   * Note: This endpoint requires Enterprise plan
   * Uses direct fetch since figma-api library may not support it
   */
  async fetchVariables(fileKey: string): Promise<VariablesResult> {
    try {
      // Direct fetch to variables endpoint
      const response = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/variables/local`,
        {
          headers: {
            'X-Figma-Token': this.token,
          },
        }
      );

      if (response.status === 403) {
        return {
          success: false,
          isEnterprise: false,
          colors: {},
          collections: {},
          error: 'Variables API requires Figma Enterprise plan',
        };
      }

      if (!response.ok) {
        return {
          success: false,
          isEnterprise: false,
          colors: {},
          collections: {},
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Parse response (structure depends on Figma API)
      await response.json(); // Response parsed but not processed in MVP

      return {
        success: true,
        isEnterprise: true,
        colors: {},
        collections: {},
      };
    } catch (error: any) {
      return {
        success: false,
        isEnterprise: false,
        colors: {},
        collections: {},
        error: error?.message || 'Failed to fetch variables',
      };
    }
  }

  /**
   * Fetch styles defined in the Figma file
   * Useful for mapping design tokens
   */
  async fetchStyles(fileKey: string): Promise<StylesResult> {
    try {
      const response = await this.api.getFileStyles({ file_key: fileKey });

      const styles: Record<string, FigmaStyle> = {};
      if (response.meta?.styles) {
        for (const [key, style] of Object.entries(response.meta.styles)) {
          const s = style as any;
          styles[key] = {
            key: s.key,
            name: s.name,
            styleType: s.style_type,
            description: s.description,
          };
        }
      }

      return { styles };
    } catch (error) {
      throw createApiError(error);
    }
  }
}
