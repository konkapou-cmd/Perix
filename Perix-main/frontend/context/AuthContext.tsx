import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  User,
  Business,
  loginUser,
  registerUser,
  getMe,
  logoutUser,
  getMyBusinesses,
} from "../lib/api";

type AuthContextValue = {
  user: User | null;
  sessionToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string, city: string, role: string, rootCategory?: string, subcategory?: string, businessName?: string, latitude?: number, longitude?: number, acceptedTerms?: boolean, accessCode?: string) => Promise<void>;
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
  myBusinesses: Business[];
  refreshMyBusinesses: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdentity, setActiveIdentityState] = useState<
    AuthContextValue["activeIdentity"]
  >(null);
  const [myBusinesses, setMyBusinesses] = useState<Business[]>([]);
  // Invalidate work started before logout (including bootstrap and refreshes).
  const authRevision = useRef(0);
  const storageWrites = useRef<Promise<void>>(Promise.resolve());
  const remoteLogout = useRef<Promise<void>>(Promise.resolve());
  const writeAuthStorage = (operation: () => Promise<void>) => {
    const next = storageWrites.current.catch(() => {}).then(operation);
    storageWrites.current = next;
    return next;
  };

  const persistSession = async (token: string) => {
    setSessionToken(token);
    await writeAuthStorage(() => AsyncStorage.setItem("session_token", token));
  };

  const persistIdentity = async (
    identity: AuthContextValue["activeIdentity"]
  ) => {
    setActiveIdentityState(identity);
    if (identity) {
      await writeAuthStorage(() => AsyncStorage.setItem("active_identity", JSON.stringify(identity)));
    } else {
      await writeAuthStorage(() => AsyncStorage.removeItem("active_identity"));
    }
  };

  const clearSession = async () => {
    setUser(null);
    setSessionToken(null);
    await writeAuthStorage(() => AsyncStorage.multiRemove(["session_token", "active_identity"]));
  };

  const bootstrapAuth = useCallback(async () => {
    const revision = authRevision.current;
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

        const stillHasToken = await AsyncStorage.getItem("session_token");
        if (revision !== authRevision.current || stillHasToken !== storedToken) {
          setLoading(false);
          return;
        }

        setUser(profile);
        setSessionToken(storedToken);
        setMyBusinesses((userBusinesses as Business[]) || []);

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
      if (revision === authRevision.current) await clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  const login = async (email: string, password: string) => {
    const revision = ++authRevision.current;
    await remoteLogout.current;
    if (revision !== authRevision.current) return;
    const response = await loginUser(email, password);
    if (revision !== authRevision.current) return;
    setUser(response.user);
    await persistSession(response.session_token);
    if (revision !== authRevision.current) return;
    try {
      const businesses = await getMyBusinesses(response.session_token);
      if (revision !== authRevision.current) return;
      setMyBusinesses(businesses || []);
    } catch {
      if (revision !== authRevision.current) return;
      setMyBusinesses([]);
    }
    const isBiz = response.user.role === "business" && response.business;
    await persistIdentity({
      type: isBiz ? "business" : "user",
      id: isBiz && response.business ? response.business.business_id : response.user.user_id,
      name: isBiz && response.business ? response.business.name : response.user.name,
      avatar: response.user.profile_photo || response.user.picture || null,
    });
  };

  const register = async (firstName: string, lastName: string, email: string, password: string, city: string, role: string, rootCategory?: string, subcategory?: string, businessName?: string, latitude?: number, longitude?: number, acceptedTerms: boolean = false, accessCode?: string) => {
    const revision = ++authRevision.current;
    await remoteLogout.current;
    if (revision !== authRevision.current) return;
    const response = await registerUser(firstName, lastName, email, password, city, role, rootCategory, subcategory, businessName, latitude, longitude, acceptedTerms, accessCode);
    if (revision !== authRevision.current) return;
    setUser(response.user);
    await persistSession(response.session_token);
    if (revision !== authRevision.current) return;
    try {
      const businesses = await getMyBusinesses(response.session_token);
      if (revision !== authRevision.current) return;
      setMyBusinesses(businesses || []);
    } catch {
      if (revision !== authRevision.current) return;
      setMyBusinesses([]);
    }
    const isBiz = response.user.role === "business" && response.business;
    await persistIdentity({
      type: isBiz ? "business" : "user",
      id: isBiz && response.business ? response.business.business_id : response.user.user_id,
      name: isBiz && response.business ? response.business.name : response.user.name,
      avatar: response.user.profile_photo || response.user.picture || null,
    });
  };

  const logout = async () => {
    const token = sessionToken;
    ++authRevision.current;
    setUser(null);
    setSessionToken(null);
    setMyBusinesses([]);
    setActiveIdentityState(null);
    // Revoke remotely, but do not make the sign-out button wait for the network.
    // A failed request never restores local authentication.
    // Clear the old cookie before a subsequent login can set a new one.
    remoteLogout.current = (async () => {
      if (token && typeof window !== "undefined" && "serviceWorker" in navigator) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const { removeWebPushSubscription } = await import("../lib/webPush");
          // Unsubscribe while the token is still valid, but never let push
          // cleanup prevent session revocation. Local logout is already done.
          await Promise.race([
            removeWebPushSubscription(token),
            new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); }),
          ]);
        } catch { /* Best effort; still revoke the server session. */ }
        finally { if (timer !== undefined) clearTimeout(timer); }
      }
      await logoutUser(token);
    })().catch(() => {});
    await writeAuthStorage(() => AsyncStorage.multiRemove(["session_token", "active_identity"]));
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    const revision = authRevision.current;
    try {
      const profile = await getMe(sessionToken);
      if (revision === authRevision.current) setUser(profile);
    } catch (error) {
      // Silent
    }
  };

  const refreshMyBusinesses = async () => {
    if (!sessionToken) return;
    const revision = authRevision.current;
    try {
      const businesses = await getMyBusinesses(sessionToken);
      if (revision === authRevision.current) setMyBusinesses(businesses || []);
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
      myBusinesses,
      refreshMyBusinesses,
    }),
    [user, sessionToken, loading, activeIdentity, myBusinesses]
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
