const fs = require('fs');
const path = require('path');

// 1. Reanimated web animation files
const reanimatedDir = path.join(__dirname, '..', 'node_modules', 'react-native-reanimated', 'src', 'layoutReanimation', 'web');
const animationDir = path.join(reanimatedDir, 'animation');

if (fs.existsSync(animationDir)) {
  const files = fs.readdirSync(animationDir);
  files.forEach(file => {
    if (file.endsWith('.web.ts')) {
      const targetName = file.replace('.web.ts', '.web');
      const targetPath = path.join(animationDir, targetName);
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(path.join(animationDir, file), targetPath);
        console.log('Patched: ' + targetName);
      }
    }
  });
}

// 2. react-native-web AccessibilityUtil/isDisabled.js — rewrite every copy to a minifier-safe form.
//    (The @flow-typed const arrow gets corrupted by Terser in some Linux CI builds,
//    producing `var t=isDisabled` with no declaration and a white screen on web.)
const SAFE_IS_DISABLED =
  '"use strict";\n' +
  'Object.defineProperty(exports, "__esModule", { value: true });\n' +
  'exports.default = function isDisabled(props) {\n' +
  '  return Boolean(props && (props.disabled || (Array.isArray(props.accessibilityStates) && props.accessibilityStates.indexOf("disabled") > -1)));\n' +
  '};\n';

const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

function walkDir(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue; // don't descend into nested node_modules via this walk
      walkDir(full);
    } else if (entry.name === 'isDisabled.js' && full.includes(path.join('modules', 'AccessibilityUtil'))) {
      try {
        const current = fs.readFileSync(full, 'utf8');
        if (current !== SAFE_IS_DISABLED) {
          fs.writeFileSync(full, SAFE_IS_DISABLED, 'utf8');
          console.log('Patched: ' + path.relative(nodeModulesDir, full));
        }
      } catch (e) {
        console.log('Skip patch: ' + full);
      }
    }
  }
}

walkDir(nodeModulesDir);
