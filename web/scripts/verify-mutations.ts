#!/usr/bin/env node

/**
 * Verification script for useMutation hooks
 * Checks that all mutations are properly implemented and used
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface MutationHook {
  name: string;
  file: string;
  line: number;
}

interface ComponentUsage {
  component: string;
  hook: string;
  line: number;
}

interface ManualMutation {
  file: string;
  line: number;
  pattern: string;
}

const MUTATIONS_FILE = 'shared/hooks/use-mutations.ts';
const FEATURES_DIR = 'features';
const COMPONENTS_DIR = 'features';

// Expected mutation hooks
const EXPECTED_MUTATIONS = [
  'useApproveBlueprintMutation',
  'useResetContextMutation',
  'useStartContextGenerationMutation',
  'useRegenerateStageMutation',
  'useStartOrRegenerateMutation',
  'useCreateSessionsMutation',
  'useStartSessionsMutation',
  'usePauseSessionsMutation',
  'useConfirmReadyMutation',
  'useUpdateEventMutation',
];

// Patterns that indicate manual mutation handling (should be removed)
const MANUAL_MUTATION_PATTERNS = [
  /method:\s*['"]POST['"]/,
  /method:\s*['"]PUT['"]/,
  /method:\s*['"]DELETE['"]/,
  /method:\s*['"]PATCH['"]/,
];

// Patterns that indicate manual state management (should use mutation states)
const MANUAL_STATE_PATTERNS = [
  /setIsResetting|setApproving|setStarting|setIsRegenerating|setIsStartingSessions|setIsPausing|setIsResuming/g,
];

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  
  files.forEach((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other non-source dirs
      if (!['node_modules', '.next', 'dist', 'build'].includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      // Skip test files and type files
      if (!file.includes('.test.') && !file.includes('.spec.')) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

function checkMutationsFile(): { found: MutationHook[]; missing: string[] } {
  try {
    const content = readFileSync(MUTATIONS_FILE, 'utf-8');
    const lines = content.split('\n');
    
    const found: MutationHook[] = [];
    const missing: string[] = [];
    
    EXPECTED_MUTATIONS.forEach((mutationName) => {
      const pattern = new RegExp(`export\\s+function\\s+${mutationName}`);
      const index = lines.findIndex((line) => pattern.test(line));
      
      if (index >= 0) {
        found.push({
          name: mutationName,
          file: MUTATIONS_FILE,
          line: index + 1,
        });
      } else {
        missing.push(mutationName);
      }
    });
    
    return { found, missing };
  } catch (error) {
    console.error(`❌ Error reading mutations file: ${error}`);
    return { found: [], missing: EXPECTED_MUTATIONS };
  }
}

function checkComponentUsage(): ComponentUsage[] {
  const componentFiles = getAllFiles(COMPONENTS_DIR);
  const usages: ComponentUsage[] = [];
  
  componentFiles.forEach((file) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      EXPECTED_MUTATIONS.forEach((mutationName) => {
        // Check for import (including destructured imports like { hook1, hook2 })
        const importPattern = new RegExp(`import.*${mutationName}.*from|from.*use-mutations`);
        const hasImport = importPattern.test(content);
        
        // Check for usage (hook call pattern: hookName(...)
        const usagePattern = new RegExp(`\\b${mutationName}\\s*\\(`);
        const usageIndex = lines.findIndex((line) => usagePattern.test(line));
        
        if (hasImport && usageIndex >= 0) {
          usages.push({
            component: file,
            hook: mutationName,
            line: usageIndex + 1,
          });
        }
      });
    } catch (error) {
      console.error(`❌ Error reading ${file}: ${error}`);
    }
  });
  
  return usages;
}

function checkManualMutations(): ManualMutation[] {
  const componentFiles = getAllFiles(COMPONENTS_DIR);
  const manualMutations: ManualMutation[] = [];
  
  componentFiles.forEach((file) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Skip if it's in a mutation hook file or comment
        if (file.includes('use-mutations') || line.trim().startsWith('//') || line.trim().startsWith('*')) {
          return;
        }
        
        MANUAL_MUTATION_PATTERNS.forEach((pattern) => {
          if (pattern.test(line)) {
            // Check if it's inside a mutation function (allowed)
            const isInMutationHook = content.substring(0, content.indexOf(line)).includes('mutationFn:');
            
            if (!isInMutationHook) {
              manualMutations.push({
                file,
                line: index + 1,
                pattern: pattern.toString(),
              });
            }
          }
        });
      });
    } catch (error) {
      console.error(`❌ Error reading ${file}: ${error}`);
    }
  });
  
  return manualMutations;
}

function checkManualStateManagement(): ManualMutation[] {
  const componentFiles = getAllFiles(COMPONENTS_DIR);
  const manualState: ManualMutation[] = [];
  
  componentFiles.forEach((file) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Skip if it's in a mutation hook file or comment
        if (file.includes('use-mutations') || line.trim().startsWith('//')) {
          return;
        }
        
        MANUAL_STATE_PATTERNS.forEach((pattern) => {
          if (pattern.test(line)) {
            manualState.push({
              file,
              line: index + 1,
              pattern: pattern.toString(),
            });
          }
        });
      });
    } catch (error) {
      console.error(`❌ Error reading ${file}: ${error}`);
    }
  });
  
  return manualState;
}

function main() {
  console.log('🔍 Verifying useMutation implementation...\n');
  
  // Check mutations file
  console.log('1. Checking mutations file...');
  const mutationsCheck = checkMutationsFile();
  console.log(`   ✅ Found ${mutationsCheck.found.length}/${EXPECTED_MUTATIONS.length} mutation hooks`);
  if (mutationsCheck.missing.length > 0) {
    console.log(`   ❌ Missing: ${mutationsCheck.missing.join(', ')}`);
  }
  console.log();
  
  // Check component usage
  console.log('2. Checking component usage...');
  const usages = checkComponentUsage();
  const usedHooks = new Set(usages.map((u) => u.hook));
  console.log(`   ✅ Found ${usages.length} usages across ${usedHooks.size} hooks`);
  
  // Group by hook
  const hooksByComponent = new Map<string, string[]>();
  usages.forEach((usage) => {
    const fileName = usage.component.split('/').pop() || usage.component;
    if (!hooksByComponent.has(fileName)) {
      hooksByComponent.set(fileName, []);
    }
    hooksByComponent.get(fileName)!.push(usage.hook);
  });
  
  if (hooksByComponent.size > 0) {
    console.log('   📋 Usage by component:');
    hooksByComponent.forEach((hooks, component) => {
      console.log(`      - ${component}: ${hooks.length} hook(s)`);
    });
  }
  
  const unusedHooks = EXPECTED_MUTATIONS.filter((hook) => !usedHooks.has(hook));
  if (unusedHooks.length > 0) {
    console.log(`   ⚠️  Unused hooks: ${unusedHooks.join(', ')}`);
  }
  console.log();
  
  // Check for manual mutations
  console.log('3. Checking for manual mutation handlers...');
  const manualMutations = checkManualMutations();
  if (manualMutations.length === 0) {
    console.log('   ✅ No manual mutation handlers found');
  } else {
    console.log(`   ⚠️  Found ${manualMutations.length} potential manual mutation handlers:`);
    manualMutations.forEach((m) => {
      console.log(`      - ${m.file}:${m.line}`);
    });
  }
  console.log();
  
  // Check for manual state management
  console.log('4. Checking for manual state management...');
  const manualState = checkManualStateManagement();
  if (manualState.length === 0) {
    console.log('   ✅ No manual mutation state management found');
  } else {
    console.log(`   ⚠️  Found ${manualState.length} instances of manual state management:`);
    manualState.slice(0, 10).forEach((m) => {
      console.log(`      - ${m.file}:${m.line}`);
    });
    if (manualState.length > 10) {
      console.log(`      ... and ${manualState.length - 10} more`);
    }
  }
  console.log();
  
  // Summary
  console.log('📊 Summary:');
  console.log(`   Mutation hooks defined: ${mutationsCheck.found.length}/${EXPECTED_MUTATIONS.length}`);
  console.log(`   Hooks used in components: ${usedHooks.size}/${EXPECTED_MUTATIONS.length}`);
  console.log(`   Manual mutations found: ${manualMutations.length}`);
  console.log(`   Manual state management: ${manualState.length}`);
  console.log();
  
  // Exit code
  const hasIssues = 
    mutationsCheck.missing.length > 0 ||
    manualMutations.length > 0 ||
    manualState.length > 0;
  
  if (hasIssues) {
    console.log('⚠️  Some issues found. Review the output above.');
    process.exit(1);
  } else {
    console.log('✅ All checks passed! All mutations are properly implemented.');
    process.exit(0);
  }
}

main();

