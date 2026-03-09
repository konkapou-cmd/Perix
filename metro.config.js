// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, '.metro-cache');
config.cacheStores = [
  new FileStore({ root: path.join(root, 'cache') }),
];

// Configure platform-specific extensions
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

// Check if building for web
const isWeb = process.env.EXPO_PUBLIC_PLATFORM === 'web' || 
              process.argv.includes('--platform=web') || 
              process.argv.some(arg => arg.includes('web'));

if (isWeb) {
  // For web platform - add web extensions first and exclude native files
  config.resolver.sourceExts = [
    'web.tsx', 'web.ts', 'web.jsx', 'web.js',
    ...config.resolver.sourceExts
  ];
  config.resolver.blockList = [
    /.*\.native\.(ts|tsx|js|jsx)$/,
    /node_modules\/react-native-agora\/.*/,
    /node_modules\/react-native-maps\/.*/,
  ];
} else {
  // For native platform - add native extensions first and exclude web files
  config.resolver.sourceExts = [
    'native.tsx', 'native.ts', 'native.jsx', 'native.js',
    ...config.resolver.sourceExts.filter(ext => !ext.startsWith('web.'))
  ];
  // Block web-specific files on native builds
  config.resolver.blockList = [
    /.*\.web\.(ts|tsx|js|jsx)$/,
  ];
}

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
