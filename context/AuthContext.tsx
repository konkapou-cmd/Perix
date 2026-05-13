import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  User,
  loginUser,
  registerUser,
  getMe,
  logoutUser,
} from "../lib/api";

type AuthContextValue = {
  user: User | null;
  sessionToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string, city: string, latitude?: number, longitude?: number) => Promise<void>;
  logout: () => Promise<void>;
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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdentity, setActiveIdentityState] = useState<
    AuthContextValue["activeIdentity"]
  >(null);

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

  const bootstrapAuth = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem("session_token");
      const storedIdentity = await AsyncStorage.getItem("active_identity");
      if (storedToken) {
        const api = await import("../lib/api");
        const [profile, userBusinesses, userArtist] = await Promise.all([
          getMe(storedToken),
          api.getMyBusinesses(storedToken).catch(() => [] as any[]),
          api.getMyArtist(storedToken).catch(() => null),
        ]);
        setUser(profile);
        setSessionToken(storedToken);

        if (storedIdentity) {
          const parsedIdentity = JSON.parse(storedIdentity);
          const isValidBusiness = parsedIdentity.type === "business" &&
            userBusinesses.some((b: any) => b.business_id === parsedIdentity.id);
          const isValidArtist = parsedIdentity.type === "artist" &&
            userArtist?.artist_id === parsedIdentity.id;
          const isValidUser = parsedIdentity.type === "user" &&
            parsedIdentity.id === profile.user_id;

          if (isValidBusiness || isValidArtist || isValidUser) {
            setActiveIdentityState(parsedIdentity);
          } else {
            setActiveIdentityState({
              type: "user",
              id: profile.user_id,
              name: profile.name,
              avatar: profile.profile_photo || profile.picture || null,
            });
          }
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

  const register = async (firstName: string, lastName: string, email: string, password: string, city: string, latitude?: number, longitude?: number) => {
    const response = await registerUser(firstName, lastName, email, password, city, latitude, longitude);
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
    try {
      if (sessionToken) {
        await logoutUser(sessionToken);
      }
    } catch {
      // Ignore API error — always clear local session
    }
    await clearSession();
    await persistIdentity(null);
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    try {
      const profile = await getMe(sessionToken);
      setUser(profile);
    } catch (error) {
      // Silent
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
