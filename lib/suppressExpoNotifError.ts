import { Platform } from "react-native";

if (Platform.OS === "android") {
  const origHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((e: Error, isFatal?: boolean) => {
    if (e?.message?.includes("expo-notifications") && e?.message?.includes("Expo Go")) {
      return;
    }
    origHandler(e, isFatal);
  });

  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.join(" ");
    if (msg.includes("expo-notifications") && msg.includes("Expo Go")) {
      return;
    }
    origConsoleError.apply(console, args);
  };
}
