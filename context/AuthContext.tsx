import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import {
  User,
  loginUser,
  registerUser,
  getMe,
  logoutUser,
  exchangeGoogleSession,
} from "../lib/api";

type AuthContextValue = {
  user: User | null;
  sessionToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  startGoogleLogin: () => Promise<void>;
  refreshUser: () => Promise<void>;
  activeIdentity: {
    type: "user" | "business" | "artist";
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
  setActiveIdentity: (identity: {
    type: "user" | "business" | "artist";
    id: string;
    name: string;
    avatar?: string | null;
  } | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://api.perixapp.com";

const AUTH_URL = "https://auth.emergentagent.com/?redirect=";

const parseSessionId = (url: string) => {
  const match = url.match(/session_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdentity, setActiveIdentityState] = useState<
    AuthContextValue["activeIdentity"]
  >(null);
  const [processingSession, setProcessingSession] = useState(false);

  const persistSession = async (token: string) => {
    setSessionToken(token);
    await AsyncStorage.setItem("session_token", token);
  };

  const persistIdentity = async (
    identity: AuthContextValue["activeIdentity"]
  ) => {
    setActiveIdentityState(identity);
    if (identity) {
      await AsyncStorage.setItem("active_identity", JSON.stringify(identity));
    } else {
      await AsyncStorage.removeItem("active_identity");
    }
  };

  const clearSession = async () => {
    setUser(null);
    setSessionToken(null);
    await AsyncStorage.removeItem("session_token");
  };

  const handleSessionId = useCallback(
    async (url: string) => {
      if (processingSession) {
        return;
      }
      const sessionId = parseSessionId(url);
      if (!sessionId) {
        return;
      }
      try {
        setProcessingSession(true);
        const response = await exchangeGoogleSession(sessionId);
        setUser(response.user);
        await persistSession(response.session_token);
      } catch (error) {
        Alert.alert("Google Login Failed", "Please try again.");
      } finally {
        setProcessingSession(false);
      }
    },
    [processingSession]
  );

  const bootstrapAuth = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem("session_token");
      const storedIdentity = await AsyncStorage.getItem("active_identity");
      if (storedToken) {
        const profile = await getMe(storedToken);
        setUser(profile);
        setSessionToken(storedToken);
        if (storedIdentity) {
          setActiveIdentityState(JSON.parse(storedIdentity));
        } else {
          setActiveIdentityState({
            type: "user",
            id: profile.user_id,
            name: profile.name,
            avatar: profile.profile_photo || profile.picture || null,
          });
        }
      }
    } catch (error) {
      await clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  useEffect(() => {
    const handleInitialUrl = async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const webUrl = window.location.href;
        if (webUrl.includes("session_id")) {
          await handleSessionId(webUrl);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        return;
      }
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleSessionId(initialUrl);
      }
    };

    handleInitialUrl();
    const subscription = Linking.addEventListener("url", async ({ url }) => {
      await handleSessionId(url);
    });
    return () => subscription.remove();
  }, [handleSessionId]);

  const login = async (email: string, password: string) => {
    const response = await loginUser(email, password);
    setUser(response.user);
    await persistSession(response.session_token);
    await persistIdentity({
      type: "user",
      id: response.user.user_id,
      name: response.user.name,
      avatar: response.user.profile_photo || response.user.picture || null,
    });
  };

  const register = async (name: string, email: string, password: string) => {
    const response = await registerUser(name, email, password);
    setUser(response.user);
    await persistSession(response.session_token);
    await persistIdentity({
      type: "user",
      id: response.user.user_id,
      name: response.user.name,
      avatar: response.user.profile_photo || response.user.picture || null,
    });
  };

  const logout = async () => {
    if (sessionToken) {
      await logoutUser(sessionToken);
    }
    await clearSession();
    await persistIdentity(null);
  };

  const startGoogleLogin = async () => {
    if (!BACKEND_URL) {
      Alert.alert("Configuration Error", "Backend URL is missing.");
      return;
    }
    const redirectUrl =
      Platform.OS === "web"
        ? window.location.origin + "/"
        : AuthSession.makeRedirectUri();
    const authUrl = `${AUTH_URL}${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

    if (result.type === "success" && result.url) {
      await handleSessionId(result.url);
    }
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    try {
      const profile = await getMe(sessionToken);
      setUser(profile);
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  };

  const value = useMemo(
    () => ({
      user,
      sessionToken,
      loading,
      login,
      register,
      logout,
      startGoogleLogin,
      refreshUser,
      activeIdentity,
      setActiveIdentity: persistIdentity,
    }),
    [user, sessionToken, loading, activeIdentity]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
