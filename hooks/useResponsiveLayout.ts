/**
 * useResponsiveLayout Hook
 * Detects screen size and returns layout mode (mobile, tablet, desktop)
 */
import { useState, useEffect } from "react";
import { useWindowDimensions, Platform } from "react-native";

export type LayoutMode = "mobile" | "tablet" | "desktop" | "wide";

interface ResponsiveLayoutState {
  width: number;
  height: number;
  layoutMode: LayoutMode;
  isDesktop: boolean;
  isTablet: boolean;
  isMobile: boolean;
  showSidebar: boolean;
  showRightPanel: boolean;
  contentMaxWidth: number;
  sidebarWidth: number;
  rightPanelWidth: number;
}

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

export function useResponsiveLayout(): ResponsiveLayoutState {
  const { width, height } = useWindowDimensions();
  
  const getLayoutMode = (w: number): LayoutMode => {
    if (w >= BREAKPOINTS.wide) return "wide";
    if (w >= BREAKPOINTS.desktop) return "desktop";
    if (w >= BREAKPOINTS.tablet) return "tablet";
    return "mobile";
  };

  const layoutMode = getLayoutMode(width);
  const isDesktop = layoutMode === "desktop" || layoutMode === "wide";
  const isTablet = layoutMode === "tablet";
  const isMobile = layoutMode === "mobile";

  // Layout calculations
  const showSidebar = isDesktop && Platform.OS === "web";
  const showRightPanel = layoutMode === "wide" && Platform.OS === "web";
  
  const sidebarWidth = showSidebar ? 260 : 0;
  const rightPanelWidth = showRightPanel ? 350 : 0;
  
  // Content max width based on layout
  const contentMaxWidth = isDesktop ? 640 : (isTablet ? 600 : width);

  return {
    width,
    height,
    layoutMode,
    isDesktop,
    isTablet,
    isMobile,
    showSidebar,
    showRightPanel,
    contentMaxWidth,
    sidebarWidth,
    rightPanelWidth,
  };
}

export default useResponsiveLayout;
