import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Perix",
  slug: "perix",
  version: "1.19.0",
  owner: "konkapou",
  orientation: "portrait",
  icon: "./assets/images/prx-icon.png",
  scheme: "perix",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.perix.citysocial",
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    },
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "Show nearby businesses.",
      NSPhotoLibraryUsageDescription: "Upload photos and videos.",
      NSPhotoLibraryAddUsageDescription: "Save media to your gallery.",
      NSCameraUsageDescription: "Capture stories, gallery media, and video calls.",
      NSMicrophoneUsageDescription: "Voice and video calls require microphone access.",
      UIBackgroundModes: ["voip"],
    },
    associatedDomains: [
      "applinks:perixapp.com",
      "applinks:app.perixapp.com",
      "applinks:www.perixapp.com",
    ],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/prx-logo.jpg",
      backgroundColor: "#ffffff",
    },
    package: "com.perix.citysocial",
    versionCode: 22,
    googleServicesFile: "./google-services.json",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "CAMERA",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "VIBRATE",
      "USE_FULL_SCREEN_INTENT",
      "POST_NOTIFICATIONS",
      "FOREGROUND_SERVICE",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      },
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "perixapp.com", pathPrefix: "/" },
          { scheme: "https", host: "app.perixapp.com", pathPrefix: "/" },
          { scheme: "https", host: "www.perixapp.com", pathPrefix: "/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
      {
        action: "VIEW",
        data: [{ scheme: "perix", host: "call", pathPrefix: "/answer" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/perix-logo.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/prx-logo.jpg",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    "expo-localization",
    "expo-font",
    "expo-audio",
    "expo-web-browser",
    [
      "expo-build-properties",
      {
        android: {
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          largeHeap: true,
          usesCleartextTraffic: true,
        },
      },
    ],
    [
      "expo-av",
      {
        microphonePermission:
          "Allow Perix to access your microphone for voice and video calls.",
      },
    ],
  ],
  extra: {
    EXPO_PUBLIC_BACKEND_URL:
      process.env.EXPO_PUBLIC_BACKEND_URL || "https://api.perixapp.com",
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    EXPO_PUBLIC_AGORA_APP_ID:
      process.env.EXPO_PUBLIC_AGORA_APP_ID || "",
    eas: {
      projectId: "a551ab03-fb09-467e-8e04-cec4567ef0bd",
    },
    router: {},
  },
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/a551ab03-fb09-467e-8e04-cec4567ef0bd",
  },
};

export default config;
