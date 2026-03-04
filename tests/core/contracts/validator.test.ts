import { describe, it, expect } from 'vitest';
import { validateGeneratedCodeContracts } from '../../../src/core/contracts/validator.js';
import type { ResolvedProjectProfile } from '../../../src/core/contracts/types.js';

function createProfile(): ResolvedProjectProfile {
  return {
    importPrefix: '@app',
    stylePattern: 'StyleSheet',
    safeAreaSupport: {
      available: false,
      importPath: 'react-native-safe-area-context',
    },
    svgSupport: {
      mode: 'raster',
      runtimeDeps: [],
    },
    assetImportPolicy: {
      relativeOnly: true,
      allowAliasAssets: false,
    },
    strictValidation: {
      strictContracts: true,
      forbidEmptyImageSources: true,
      forbidPlaceholderUris: true,
      forbidUnresolvedAliasRequires: true,
    },
    diagnostics: [],
  };
}

describe('validateGeneratedCodeContracts', () => {
  it('should report hard P0 violations', () => {
    const profile = createProfile();
    const code = `
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgIcon } from '@app/components';
const x = <Image source={{ uri: '' }} />;
const y = { uri: "https://via.placeholder.com/150?text=a" };
const z = require('@app/icons/test.svg');
`;

    const result = validateGeneratedCodeContracts(code, profile);
    const codes = result.diagnostics.map((d) => d.code);

    expect(result.hasBlockingErrors).toBe(true);
    expect(codes).toContain('EMPTY_IMAGE_SOURCE');
    expect(codes).toContain('PLACEHOLDER_URI');
    expect(codes).toContain('ALIAS_ASSET_REQUIRE');
    expect(codes).toContain('SAFE_AREA_IMPORT_UNAVAILABLE');
    expect(codes).toContain('SVG_ICON_IMPORT_UNSUPPORTED');
  });

  it('should accept relative asset requires and valid imports', () => {
    const profile = createProfile();
    const code = `
import React from 'react';
import { Image, View } from 'react-native';
const icon = require('./assets/icons/x.png');
export function A() {
  return <View><Image source={icon} /></View>;
}
`;

    const result = validateGeneratedCodeContracts(code, profile);
    expect(result.hasBlockingErrors).toBe(false);
  });
});
