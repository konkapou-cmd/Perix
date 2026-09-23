import React, { useEffect, useState } from "react";
import { Platform, View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../lib/designTokens";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "perix-install-banner-dismissed";
const BLUE = "#59ABE3";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    if ((navigator as any).standalone === true) return true;
  } catch {}
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Every visit (new browser session) shows a prompt to open/install the Perix
 * web app — with platform-specific guidance:
 *  - iOS: "Add to Home Screen" steps (Share → Add to Home Screen).
 *  - Android: native install prompt when Chrome offers it, otherwise the
 *    Chrome-menu instructions.
 * Dismissal is remembered only for the current session, so the next visit
 * sees the prompt again.
 */
export default function InstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {}

    if (isStandalone() || (storage && storage.getItem(DISMISS_KEY))) return;

    setIos(isIOS());

    // Show on every visit: immediately for Android/desktop, after a short
    // delay on iOS (so the page renders first).
    const timer = setTimeout(() => setShowBanner(true), isIOS() ? 1500 : 300);
    setShowBanner(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (Platform.OS !== "web" || !showBanner) return null;

  const dismiss = () => {
    setShowBanner(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferredPrompt) {
      setShowHelpModal(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setShowBanner(false);
        return;
      }
    } catch {}
    setShowHelpModal(true);
  };

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.brandWrap}>
          <Text style={styles.logoText}>Perix</Text>
          <Ionicons name="sunny" size={9} color="#FFC93C" style={styles.brandSun} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{t("install.title", "Install Perix")}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {t("install.subtitle", "Add Perix to your home screen for the best experience")}
          </Text>
        </View>
        <Pressable
          style={styles.button}
          onPress={install}
          testID="install-banner-action"
        >
          <Ionicons name={deferredPrompt ? "download-outline" : "phone-portrait-outline"} size={16} color="#fff" />
          <Text style={styles.buttonText}>
            {deferredPrompt ? t("install.install", "Install") : t("install.openApp", "Open app")}
          </Text>
        </Pressable>
        <Pressable onPress={dismiss} style={styles.close} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color="#9ca3af" />
        </Pressable>
      </View>

      <Modal
        transparent
        visible={showHelpModal}
        animationType="fade"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {ios
                ? t("install.iosTitle", "Add Perix to your Home Screen")
                : t("install.androidTitle", "Install the Perix web app")}
            </Text>
            {ios ? (
              <>
                <View style={styles.step}>
                  <Ionicons name="share-outline" size={22} color={BLUE} />
                  <Text style={styles.stepText}>
                    {t("install.iosStep1", "Tap the Share button at the bottom of Safari")}
                  </Text>
                </View>
                <View style={styles.step}>
                  <Ionicons name="add-circle-outline" size={22} color={BLUE} />
                  <Text style={styles.stepText}>{t("install.iosStep2", 'Choose "Add to Home Screen"')}</Text>
                </View>
                <View style={styles.step}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={BLUE} />
                  <Text style={styles.stepText}>
                    {t("install.iosStep3", 'Tap "Add" and open Perix from your home screen')}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.step}>
                  <Ionicons name="ellipsis-vertical" size={22} color={BLUE} />
                  <Text style={styles.stepText}>
                    {t("install.androidStep1", 'Open the Chrome menu (⋮) at the top right')}
                  </Text>
                </View>
                <View style={styles.step}>
                  <Ionicons name="download-outline" size={22} color={BLUE} />
                  <Text style={styles.stepText}>
                    {t("install.androidStep2", 'Tap "Install app" or "Add to Home screen"')}
                  </Text>
                </View>
                <View style={styles.step}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={BLUE} />
                  <Text style={styles.stepText}>
                    {t("install.androidStep3", "Perix will appear on your home screen like a native app")}
                  </Text>
                </View>
              </>
            )}
            <Pressable style={styles.modalButton} onPress={() => setShowHelpModal(false)}>
              <Text style={styles.modalButtonText}>{t("install.gotIt", "Got it")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = {
  banner: {
    position: "absolute" as const,
    bottom: 16,
    left: 12,
    right: 12,
    zIndex: 1000,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  brandWrap: {
    position: "relative" as const,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
  },
  brandSun: {
    position: "absolute" as const,
    right: 7,
    top: 0,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textDark,
    marginTop: 2,
  },
  button: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700" as const,
    fontSize: 13,
  },
  close: {
    padding: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  modalCard: {
    width: "100%" as const,
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800" as const,
    color: COLORS.textPrimary,
    textAlign: "center" as const,
    marginBottom: 4,
  },
  step: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textDark,
  },
  modalButton: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center" as const,
    marginTop: 6,
  },
  modalButtonText: {
    color: "#ffffff",
    fontWeight: "700" as const,
    fontSize: 15,
  },
};
