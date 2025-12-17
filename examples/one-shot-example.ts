/**
 * ONE-SHOT generator usage example
 */

import { generateCompleteScreen, saveGeneratedFiles, generateMultipleScreens } from '../src/one-shot-generator.js';

/**
 * Example 1: Basic single screen generation
 */
async function example1_BasicGeneration() {
  console.log('=== Example 1: Basic generation ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/ABC123/Project?node-id=1-234';
  const screenName = 'ProductListScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    console.log(`✓ Screen name: ${result.screenName}`);
    console.log(`✓ Screen type: ${result.summary.screenType}`);
    console.log(`✓ Files generated: ${result.files.length}`);
    console.log(`✓ Confidence: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);

    console.log('\nGenerated files:');
    result.files.forEach(file => {
      console.log(`  - ${file.path} (${file.type})`);
    });

    // Display detection info
    if (result.detections.list) {
      console.log(`\nList detected:`);
      console.log(`  - Type: ${result.detections.list.type}`);
      console.log(`  - Items: ${result.detections.list.itemCount}`);
      console.log(`  - Orientation: ${result.detections.list.orientation}`);
    }

    if (result.detections.form) {
      console.log(`\nForm detected:`);
      console.log(`  - Fields: ${result.detections.form.fields.length}`);
      console.log(`  - Submit button: ${result.detections.form.hasSubmitButton ? 'yes' : 'no'}`);
    }

    if (result.detections.dataModels.length > 0) {
      console.log(`\nData models:`);
      result.detections.dataModels.forEach(model => {
        console.log(`  - ${model.name} (${model.fields.length} fields)`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Generation with advanced options
 */
async function example2_AdvancedOptions() {
  console.log('\n=== Example 2: Advanced options ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/XYZ789/App?node-id=5-678';
  const screenName = 'CheckoutFormScreen';

  try {
    const result = await generateCompleteScreen(
      figmaToken,
      figmaUrl,
      screenName,
      {
        generateTypes: true,        // Generate TypeScript types
        generateHooks: true,         // Generate React Query hooks
        detectAnimations: true,      // Detect animations (slower)
        generateExtras: true,        // Generate additional files
        config: {
          framework: 'react-native',
          codeStyle: {
            stylePattern: 'StyleSheet',
            scaleFunction: 'scale',
            importPrefix: '@/',
          },
          mappings: {
            colors: {
              '#7A54FF': 'palette.primary',
              '#FF5454': 'palette.error',
              '#22C55E': 'palette.success',
            },
          },
        },
      }
    );

    console.log(`✓ Generated ${result.files.length} files`);

    // Check for animations
    if (result.summary.hasAnimations && result.detections.animations) {
      console.log('\nAnimations detected:');
      console.log(`  - Transitions: ${result.detections.animations.transitions.length}`);
      console.log(`  - Gesture areas: ${result.detections.animations.gestureAreas.length}`);
      console.log(`  - Shared elements: ${result.detections.animations.sharedElements.length}`);
    }

    // Save files
    await saveGeneratedFiles(result, './generated');
    console.log('\n✓ Files saved to ./generated');
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Batch generation of multiple screens
 */
async function example3_BatchGeneration() {
  console.log('\n=== Example 3: Batch generation ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';

  const screens = [
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=1-1',
      name: 'HomeScreen',
    },
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=2-2',
      name: 'ProfileScreen',
    },
    {
      url: 'https://www.figma.com/file/ABC/Project?node-id=3-3',
      name: 'SettingsScreen',
    },
  ];

  try {
    console.log(`Generating ${screens.length} screens...`);

    const results = await generateMultipleScreens(
      figmaToken,
      screens,
      {
        generateTypes: true,
        generateHooks: true,
        detectAnimations: false, // Disable for speed
      }
    );

    console.log('\n✓ Generation complete\n');

    // Display summary for each screen
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.screenName}`);
      console.log(`   - Type: ${result.summary.screenType}`);
      console.log(`   - Files: ${result.files.length}`);
      console.log(`   - Confidence: ${(result.summary.metadata.confidence * 100).toFixed(0)}%`);
    });

    // Save all files
    for (const result of results) {
      await saveGeneratedFiles(result, './generated');
    }

    console.log('\n✓ All files saved to ./generated');
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 4: Conditional generation based on detections
 */
async function example4_ConditionalGeneration() {
  console.log('\n=== Example 4: Conditional generation ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/DEF/App?node-id=7-890';
  const screenName = 'DynamicScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    // Check detection confidence
    if (result.summary.metadata.confidence < 0.5) {
      console.warn('⚠ Low detection confidence. Manual review recommended.');
    }

    // Different behavior based on screen type
    switch (result.summary.screenType) {
      case 'form':
        console.log('✓ Form detected');
        console.log(`  - Fields: ${result.detections.form?.fields.length}`);

        // Save only form files
        const formFiles = result.files.filter(
          f => f.type === 'form' || f.type === 'screen'
        );

        for (const file of formFiles) {
          await saveGeneratedFiles({ ...result, files: [file] }, './generated');
        }
        break;

      case 'list':
        console.log('✓ List detected');
        console.log(`  - Items: ${result.detections.list?.itemCount}`);

        // Generate additional hooks for pagination
        console.log('  - Consider adding pagination');
        break;

      case 'sheet':
      case 'modal':
        console.log('✓ Overlay detected');
        console.log(`  - Type: ${result.detections.sheet?.type}`);
        console.log(`  - Snap points: ${result.detections.sheet?.snapPoints.join(', ')}`);
        break;

      default:
        console.log('✓ Regular screen');
    }

    // Check for data models
    if (result.detections.dataModels.length > 0) {
      console.log('\n✓ Data models detected:');
      result.detections.dataModels.forEach(model => {
        console.log(`  - ${model.name}:`);
        model.fields.slice(0, 5).forEach(field => {
          console.log(`    • ${field.name}: ${field.type}`);
        });

        if (model.fields.length > 5) {
          console.log(`    ... and ${model.fields.length - 5} more fields`);
        }
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 5: Custom result processing
 */
async function example5_CustomProcessing() {
  console.log('\n=== Example 5: Custom processing ===\n');

  const figmaToken = process.env.FIGMA_TOKEN || 'your-token-here';
  const figmaUrl = 'https://www.figma.com/file/GHI/Project?node-id=9-012';
  const screenName = 'CustomScreen';

  try {
    const result = await generateCompleteScreen(figmaToken, figmaUrl, screenName);

    // Modify generated files
    const modifiedFiles = result.files.map(file => {
      let content = file.content;

      // Add custom import
      if (file.type === 'screen') {
        content = content.replace(
          "import React from 'react';",
          "import React from 'react';\nimport { useTheme } from '@/hooks/useTheme';"
        );
      }

      // Add custom comments
      content = `/**\n * Auto-generated by ONE-SHOT generator\n * Generated: ${new Date().toISOString()}\n * Source: ${figmaUrl}\n */\n\n${content}`;

      return {
        ...file,
        content,
      };
    });

    // Group files by type
    const filesByType = modifiedFiles.reduce((acc, file) => {
      if (!acc[file.type]) {
        acc[file.type] = [];
      }
      acc[file.type].push(file);
      return acc;
    }, {} as Record<string, typeof modifiedFiles>);

    console.log('Files grouped by type:');
    Object.entries(filesByType).forEach(([type, files]) => {
      console.log(`  ${type}: ${files.length} file(s)`);
    });

    // Create index file for exports
    const indexContent = modifiedFiles
      .filter(f => f.type === 'screen' || f.type === 'types')
      .map(f => {
        const name = f.path.split('/').pop()?.replace(/\.(tsx?|js)$/, '');
        return `export * from './${name}';`;
      })
      .join('\n');

    console.log('\n✓ Created index file with exports');

    // Save modified files
    await saveGeneratedFiles(
      { ...result, files: modifiedFiles },
      './generated'
    );

    console.log('✓ Saved modified files');
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  // await example1_BasicGeneration();
  // await example2_AdvancedOptions();
  // await example3_BatchGeneration();
  // await example4_ConditionalGeneration();
  // await example5_CustomProcessing();

  console.log('\n=== Examples complete ===\n');
  console.log('Uncomment needed examples to run them');
}

// Run when file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

// Export examples for use in other files
export {
  example1_BasicGeneration,
  example2_AdvancedOptions,
  example3_BatchGeneration,
  example4_ConditionalGeneration,
  example5_CustomProcessing,
};
