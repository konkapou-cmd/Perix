// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => ({
    coords: { latitude: 40.7128, longitude: -74.0060 },
  })),
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  MediaTypeOptions: {
    Images: 'Images',
    Videos: 'Videos',
    All: 'All',
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  cacheDirectory: '/cache/',
  copyAsync: jest.fn(),
  getInfoAsync: jest.fn(() => ({ exists: true, size: 1000 })),
}));

// Mock fetch
global.fetch = jest.fn();
