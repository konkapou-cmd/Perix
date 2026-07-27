const fs = require('fs');
const path = require('path');

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
