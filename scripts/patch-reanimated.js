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

// 2. react-native-web AccessibilityUtil/isDisabled.js — rewrite to a minifier-safe form.
//    (The @flow-typed const arrow gets corrupted by Terser in some Linux CI builds,
//    producing `var t=isDisabled` with no declaration and a white screen on web.)
const isDisabledPath = path.join(__dirname, '..', 'node_modules', 'react-native-web', 'src', 'modules', 'AccessibilityUtil', 'isDisabled.js');
if (fs.existsSync(isDisabledPath)) {
  const safeContent =
    '"use strict";\n' +
    'Object.defineProperty(exports, "__esModule", { value: true });\n' +
    'exports.default = function isDisabled(props) {\n' +
    '  return Boolean(props && (props.disabled || (Array.isArray(props.accessibilityStates) && props.accessibilityStates.indexOf("disabled") > -1)));\n' +
    '};\n';
  fs.writeFileSync(isDisabledPath, safeContent, 'utf8');
  console.log('Patched: react-native-web AccessibilityUtil/isDisabled.js');
}
