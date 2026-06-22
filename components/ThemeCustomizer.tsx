import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { updateProfileTheme, ProfileTheme } from '../lib/api';
import { COLORS } from '../lib/designTokens';

// Extended color presets with gradient options - aligned with business categories
const COLOR_PRESETS = [
  // Clean Light Presets
  {
    name: 'Clean',
    background: '#FBF8FF',
    primary: '#5B16C9',
    secondary: '#F5EEFF',
    text: '#120A35',
    accent: '#FFC400',
    gradient: ['#FBF8FF', '#F5EEFF'],
  },
  // Sports & Wellness - Energetic Orange
  {
    name: 'Active',
    background: '#fff7ed',
    primary: '#f97316',
    secondary: '#ffedd5',
    text: '#7c2d12',
    accent: '#ea580c',
    gradient: ['#fff7ed', '#ffedd5'],
  },
  // Fashion & Retail - Luxe Pink
  {
    name: 'Luxe',
    background: '#fdf2f8',
    primary: '#ec4899',
    secondary: '#fce7f3',
    text: '#831843',
    accent: '#f472b6',
    gradient: ['#fdf2f8', '#fce7f3'],
  },
  // Entertainment - Bold Purple
  {
    name: 'Entertain',
    background: '#faf5ff',
    primary: '#a855f7',
    secondary: '#f3e8ff',
    text: '#581c87',
    accent: '#c084fc',
    gradient: ['#faf5ff', '#f3e8ff'],
  },
  // Bars & Nightlife - Deep Gold
  {
    name: 'Night',
    background: '#fefce8',
    primary: '#ca8a04',
    secondary: '#fef9c3',
    text: '#713f12',
    accent: '#eab308',
    gradient: ['#fefce8', '#fef9c3'],
  },
  // Professional - Corporate Blue
  {
    name: 'Corporate',
    background: '#f0f9ff',
    primary: '#0284c7',
    secondary: '#e0f2fe',
    text: '#0c4a6e',
    accent: '#38bdf8',
    gradient: ['#f0f9ff', '#e0f2fe'],
  },
  // Beauty & Care - Elegant Rose
  {
    name: 'Beauty',
    background: '#fff1f2',
    primary: '#f43f5e',
    secondary: '#ffe4e6',
    text: '#881337',
    accent: '#fb7185',
    gradient: ['#fff1f2', '#ffe4e6'],
  },
  // Education - Scholar Navy
  {
    name: 'Scholar',
    background: '#eff6ff',
    primary: '#3b82f6',
    secondary: '#dbeafe',
    text: '#1e3a8a',
    accent: '#60a5fa',
    gradient: ['#eff6ff', '#dbeafe'],
  },
  // Restaurants - Culinary Warm
  {
    name: 'Culinary',
    background: '#fef2f2',
    primary: '#dc2626',
    secondary: '#fee2e2',
    text: '#7f1d1d',
    accent: '#ef4444',
    gradient: ['#fef2f2', '#fee2e2'],
  },
  // Minimal Dark
  {
    name: 'Dark',
    background: '#18181b',
    primary: '#71717a',
    secondary: '#27272a',
    text: '#fafafa',
    accent: '#a1a1aa',
    gradient: ['#18181b', '#27272a'],
  },
];

// Premium presets with gradient and box color overrides - dark themes for premium look
const PREMIUM_PRESETS = [
  // Elegant Black & White - Minimal, flat, no shadows/curves
  {
    name: 'Elegant',
    background: '#ffffff',
    primary: '#000000',
    secondary: '#f5f5f5',
    text: '#000000',
    accent: '#000000',
    gradient: ['#ffffff', '#f5f5f5'],
    useGradient: true,
    galleryCard: '#f5f5f5',
    infoCard: '#f5f5f5',
    actionButton: '#000000',
    border: '#e5e7eb',
  },
  // Aurora Purple - Entertainment/Nightlife
  {
    name: 'Aurora',
    background: '#0c0c1d',
    primary: '#a855f7',
    secondary: '#1a1a3e',
    text: '#f5f3ff',
    accent: '#c084fc',
    gradient: ['#0c0c1d', '#1a0a2e'],
    useGradient: true,
    galleryCard: '#1a1a3e',
    infoCard: '#151530',
    actionButton: '#a855f7',
    border: '#2d2b55',
  },
  // Sapphire Blue - Corporate/Professional
  {
    name: 'Sapphire',
    background: '#0a1628',
    primary: '#38bdf8',
    secondary: '#0f2040',
    text: '#f0f9ff',
    accent: '#7dd3fc',
    gradient: ['#0a1628', '#0f2040'],
    useGradient: true,
    galleryCard: '#0f2040',
    infoCard: '#0a1a30',
    actionButton: '#38bdf8',
    border: '#1e3a5f',
  },
  // Ruby Night - Fashion/Beauty
  {
    name: 'Ruby',
    background: '#1a0510',
    primary: '#f43f5e',
    secondary: '#2d0a18',
    text: '#fff1f2',
    accent: '#fb7185',
    gradient: ['#1a0510', '#2d0a18'],
    useGradient: true,
    galleryCard: '#2d0a18',
    infoCard: '#1f0812',
    actionButton: '#f43f5e',
    border: '#3d1525',
  },
  // Ember Orange - Restaurants/Bars
  {
    name: 'Ember',
    background: '#1a0f05',
    primary: '#f97316',
    secondary: '#2d1a0a',
    text: '#fff7ed',
    accent: '#fb923c',
    gradient: ['#1a0f05', '#2d1a0a'],
    useGradient: true,
    galleryCard: '#2d1a0a',
    infoCard: '#1f1208',
    actionButton: '#f97316',
    border: '#3d2510',
  },
  // Emerald Dark - Sports/Wellness (minimal green, elegant)
  {
    name: 'Emerald',
    background: '#021a12',
    primary: '#10b981',
    secondary: '#0a2a1a',
    text: '#d1fae5',
    accent: '#34d399',
    gradient: ['#021a12', '#0a2a1a'],
    useGradient: true,
    galleryCard: '#0a2a1a',
    infoCard: '#052015',
    actionButton: '#10b981',
    border: '#1a3d2a',
  },
  // Amethyst - Creative/Education
  {
    name: 'Amethyst',
    background: '#0f0a1a',
    primary: '#8b5cf6',
    secondary: '#1a1030',
    text: '#f5f3ff',
    accent: '#a78bfa',
    gradient: ['#0f0a1a', '#1a1030'],
    useGradient: true,
    galleryCard: '#1a1030',
    infoCard: '#12081f',
    actionButton: '#8b5cf6',
    border: '#2d1f40',
  },
  // Onyx Gold - Luxury/Professional
  {
    name: 'Onyx',
    background: '#0a0a0a',
    primary: '#eab308',
    secondary: '#1a1a0a',
    text: '#fafafa',
    accent: '#facc15',
    gradient: ['#0a0a0a', '#1a1a0a'],
    useGradient: true,
    galleryCard: '#1a1a0a',
    infoCard: '#0f0f0a',
    actionButton: '#eab308',
    border: '#2a2a15',
  },
  // Obsidian Teal - Minimalist
  {
    name: 'Obsidian',
    background: '#0a0f0d',
    primary: '#14b8a6',
    secondary: '#0f1a17',
    text: '#f0fdfa',
    accent: '#2dd4bf',
    gradient: ['#0a0f0d', '#0f1a17'],
    useGradient: true,
    galleryCard: '#0f1a17',
    infoCard: '#08120f',
    actionButton: '#14b8a6',
    border: '#1a2d25',
  },
];

// Extended color palette with more options
const CUSTOM_COLORS = [
  // Reds
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
  // Oranges
  '#f97316', '#ea580c', '#c2410c', '#9a3412',
  // Yellows
  '#f59e0b', '#eab308', '#ca8a04', '#a16207',
  // Greens
  '#84cc16', '#22c55e', '#10b981', '#059669', '#047857',
  // Cyans
  '#14b8a6', '#06b6d4', '#0891b2', '#0e7490',
  // Blues
  '#0ea5e9', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af',
  // Indigos
  '#FFD700', '#4f46e5', '#4338ca', '#3730a3',
  // Purples
  '#FF6B6B', '#a855f7', '#9333ea', '#7c3aed',
  // Pinks
  '#d946ef', '#ec4899', '#db2777', '#be185d',
  // Neutrals
  '#ffffff', '#f5f5f5', '#e5e5e5', '#a1a1aa', '#71717a',
  '#52525b', '#3f3f46', '#27272a', '#18181b', '#000000',
];

// Artistic font combinations with styles
const FONT_OPTIONS = [
  { id: 'default', name: 'Classic', fontFamily: undefined, fontWeight: '400', fontStyle: 'normal', letterSpacing: 0, textTransform: 'none', sampleText: 'Clean & Simple' },
  { id: 'bold-modern', name: 'Bold Modern', fontFamily: 'sans-serif', fontWeight: '700', fontStyle: 'normal', letterSpacing: -0.5, textTransform: 'none', sampleText: 'Bold Impact' },
  { id: 'elegant-serif', name: 'Editorial', fontFamily: 'serif', fontWeight: '500', fontStyle: 'normal', letterSpacing: 0, textTransform: 'none', sampleText: 'Editorial Style' },
  { id: 'minimal', name: 'Minimal', fontFamily: 'sans-serif', fontWeight: '300', fontStyle: 'normal', letterSpacing: 0.3, textTransform: 'none', sampleText: 'Minimal Light' },
  { id: 'corporate', name: 'Corporate', fontFamily: 'sans-serif', fontWeight: '600', fontStyle: 'normal', letterSpacing: -0.3, textTransform: 'none', sampleText: 'Corporate Strong' },
  { id: 'mono-tech', name: 'Tech Mono', fontFamily: 'monospace', fontWeight: '400', fontStyle: 'normal', letterSpacing: 1, textTransform: 'none', sampleText: 'Tech & Modern' },
  { id: 'display', name: 'Display', fontFamily: 'sans-serif', fontWeight: '900', fontStyle: 'italic', letterSpacing: -1, textTransform: 'none', sampleText: 'Display Bold' },
  { id: 'friendly', name: 'Friendly', fontFamily: 'sans-serif', fontWeight: '400', fontStyle: 'normal', letterSpacing: 0.5, textTransform: 'none', sampleText: 'Friendly & Open' },
  { id: 'clean', name: 'Clean', fontFamily: 'sans-serif', fontWeight: '300', fontStyle: 'normal', letterSpacing: 0.5, textTransform: 'none', sampleText: 'Clean Light' },
  { id: 'elegant-modern', name: 'Elegant Modern', fontFamily: 'sans-serif', fontWeight: '300', fontStyle: 'italic', letterSpacing: 0.5, textTransform: 'none', sampleText: 'Refined Edge' },
  { id: 'geometric', name: 'Geometric', fontFamily: 'sans-serif', fontWeight: '700', fontStyle: 'normal', letterSpacing: -0.5, textTransform: 'none', sampleText: 'Geometric Bold' },
  { id: 'artistic', name: 'Artistic', fontFamily: 'cursive', fontWeight: '400', fontStyle: 'italic', letterSpacing: 1, textTransform: 'none', sampleText: 'Artistic Charm' },
];

// Border radius options
const RADIUS_OPTIONS = [
  { id: 'sharp', name: 'Sharp', value: 0 },
  { id: 'subtle', name: 'Subtle', value: 8 },
  { id: 'rounded', name: 'Rounded', value: 16 },
  { id: 'pill', name: 'Pill', value: 24 },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  currentTheme?: ProfileTheme | null;
  sessionToken: string;
  onThemeUpdated?: () => void;
  saveThemeOverride?: (theme: ProfileTheme) => Promise<void>;
};

type TabType = 'presets' | 'colors' | 'fonts' | 'advanced';

export default function ThemeCustomizer({
  visible,
  onClose,
  currentTheme,
  sessionToken,
  onThemeUpdated,
  saveThemeOverride,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<keyof ProfileTheme | null>(null);
  const [theme, setTheme] = useState<ProfileTheme>({
    background_color: currentTheme?.background_color || '#ffffff',
    primary_color: currentTheme?.primary_color || '#000000',
    secondary_color: currentTheme?.secondary_color || '#f9fafb',
    text_color: currentTheme?.text_color || '#111827',
    card_color: currentTheme?.card_color || '#ffffff',
    gradient_start: currentTheme?.gradient_start || null,
    gradient_end: currentTheme?.gradient_end || null,
    use_gradient: currentTheme?.use_gradient || false,
    font_family: currentTheme?.font_family || null,
    font_weight: currentTheme?.font_weight || null,
    font_style: currentTheme?.font_style || null,
    letter_spacing: currentTheme?.letter_spacing || null,
    text_transform: currentTheme?.text_transform || null,
    gallery_card_color: currentTheme?.gallery_card_color || null,
    info_card_color: currentTheme?.info_card_color || null,
    action_button_color: currentTheme?.action_button_color || null,
    border_color: currentTheme?.border_color || null,
  });
  const [saving, setSaving] = useState(false);
  const [customHex, setCustomHex] = useState('');

  // Reset theme state when modal opens
  useEffect(() => {
    if (visible) {
      setTheme({
        background_color: currentTheme?.background_color || '#ffffff',
        primary_color: currentTheme?.primary_color || '#000000',
        secondary_color: currentTheme?.secondary_color || '#f9fafb',
        text_color: currentTheme?.text_color || '#111827',
        card_color: currentTheme?.card_color || '#ffffff',
        gradient_start: currentTheme?.gradient_start || null,
        gradient_end: currentTheme?.gradient_end || null,
        use_gradient: currentTheme?.use_gradient || false,
        font_family: currentTheme?.font_family || null,
        font_weight: currentTheme?.font_weight || null,
        font_style: currentTheme?.font_style || null,
        letter_spacing: currentTheme?.letter_spacing || null,
        text_transform: currentTheme?.text_transform || null,
        gallery_card_color: currentTheme?.gallery_card_color || null,
        info_card_color: currentTheme?.info_card_color || null,
        action_button_color: currentTheme?.action_button_color || null,
        border_color: currentTheme?.border_color || null,
      });
      setSelectedPreset(null);
      setSelectedField(null);
    }
  }, [visible, currentTheme]);

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    setTheme(prev => ({
      ...prev,
      background_color: preset.background,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      text_color: preset.text,
      card_color: preset.secondary,
      gradient_start: preset.gradient[0],
      gradient_end: preset.gradient[1],
      use_gradient: false,
      gallery_card_color: prev.gallery_card_color || preset.secondary,
      info_card_color: prev.info_card_color || preset.secondary,
      action_button_color: prev.action_button_color || preset.primary,
    }));
  };

  const applyPremiumPreset = (preset: typeof PREMIUM_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    setTheme(prev => ({
      ...prev,
      background_color: preset.background,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      text_color: preset.text,
      card_color: preset.secondary,
      gradient_start: preset.gradient[0],
      gradient_end: preset.gradient[1],
      use_gradient: preset.useGradient,
      gallery_card_color: preset.galleryCard,
      info_card_color: preset.infoCard,
      action_button_color: preset.actionButton,
      border_color: preset.border,
    }));
  };

  const selectCustomColor = (color: string, fieldKey?: string) => {
    const targetField = fieldKey || selectedField;
    if (!targetField) return;
    setTheme(prev => ({ ...prev, [targetField]: color }));
    setSelectedPreset(null);
  };

  const applyCustomHex = () => {
    if (!selectedField || !customHex) return;
    const hex = customHex.startsWith('#') ? customHex : `#${customHex}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setTheme(prev => ({ ...prev, [selectedField]: hex }));
      setCustomHex('');
      setSelectedPreset(null);
    } else {
      Alert.alert('Invalid Color', 'Please enter a valid hex color (e.g., #FF0000)');
    }
  };

  const saveTheme = async () => {
    if (!sessionToken) return;
    
    setSaving(true);
    try {
      if (saveThemeOverride) {
        await saveThemeOverride(theme);
      } else {
        await updateProfileTheme(sessionToken, theme);
      }
      Alert.alert(
        t('theme.success') || 'Success',
        t('theme.themeUpdated') || 'Your profile theme has been updated!'
      );
      onThemeUpdated?.();
      onClose();
    } catch (error: any) {
      Alert.alert(
        t('common.error') || 'Error',
        error.message || t('theme.updateFailed') || 'Failed to update theme'
      );
    } finally {
      setSaving(false);
    }
  };

  const resetTheme = () => {
    setTheme({
      background_color: '#ffffff',
      primary_color: '#000000',
      secondary_color: '#f5f5f5',
      text_color: '#000000',
      card_color: '#ffffff',
      gradient_start: '#ffffff',
      gradient_end: '#f5f5f5',
      use_gradient: true,
      font_family: null,
      font_weight: null,
      font_style: null,
      letter_spacing: null,
      text_transform: null,
      gallery_card_color: '#f5f5f5',
      info_card_color: '#f5f5f5',
      action_button_color: '#000000',
      border_color: '#e5e7eb',
    });
    setSelectedPreset(null);
    setSelectedField(null);
  };

  const renderFontsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>{t('theme.fontFamily') || 'Font Style'}</Text>
      <Text style={styles.sectionHint}>{t('theme.fontHint') || 'Choose a font style for your profile'}</Text>
      <View style={styles.fontGrid}>
        {FONT_OPTIONS.map((font) => {
          const isSelected = theme.font_family === font.fontFamily && 
                           theme.font_weight === font.fontWeight &&
                           theme.font_style === font.fontStyle;
          return (
            <Pressable
              key={font.id}
              style={[
                styles.fontCard,
                isSelected && styles.fontCardSelected,
              ]}
              onPress={() => setTheme(prev => ({ 
                ...prev, 
                font_family: font.fontFamily,
                font_weight: font.fontWeight,
                font_style: font.fontStyle,
                letter_spacing: font.letterSpacing,
                text_transform: font.textTransform,
              }))}
            >
              <Text 
                style={[
                  styles.fontName,
                  isSelected && styles.fontNameSelected,
                ]}
              >
                {font.name}
              </Text>
              <Text 
                style={[
                  styles.fontSample,
                  { 
                    fontFamily: font.fontFamily,
                    fontWeight: font.fontWeight as any,
                    fontStyle: font.fontStyle as any,
                    letterSpacing: font.letterSpacing,
                    textTransform: font.textTransform as any,
                  },
                  isSelected && styles.fontSampleSelected,
                ]}
              >
                {font.sampleText}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderPreview = () => (
    <View style={styles.previewSection}>
      <Text style={styles.previewLabel}>{t('theme.preview') || 'Preview'}</Text>
      {theme.use_gradient && theme.gradient_start && theme.gradient_end ? (
        <LinearGradient
          colors={[theme.gradient_start, theme.gradient_end]}
          style={styles.previewCard}
        >
          {renderPreviewContent()}
        </LinearGradient>
      ) : (
        <View style={[styles.previewCard, { backgroundColor: (theme.background_color || '#ffffff') as any }]}>
          {renderPreviewContent()}
        </View>
      )}
    </View>
  );

  const renderPreviewContent = () => {
    const fontStyle: import('react-native').TextStyle = {
      fontFamily: theme.font_family || undefined,
      fontWeight: (theme.font_weight || undefined) as any,
      fontStyle: (theme.font_style || undefined) as any,
      letterSpacing: theme.letter_spacing || undefined,
      textTransform: (theme.text_transform || undefined) as any,
    };
    return (
    <>
      <View style={styles.previewHeader}>
        <View style={[styles.previewAvatar, { backgroundColor: (theme.primary_color || '#000000') as any }]}>
          <Ionicons name="person" size={20} color={(theme.text_color || '#fff') as any} />
        </View>
        <View style={styles.previewInfo}>
          <Text style={[styles.previewName, { color: (theme.text_color || '#fff') as any, ...fontStyle }]}>Username</Text>
          <Text style={[styles.previewBio, { color: (theme.text_color || '#fff') as any, opacity: 0.7, ...fontStyle }]}>Bio text here</Text>
        </View>
      </View>
      <View style={[styles.previewCardInner, { backgroundColor: (theme.card_color || theme.secondary_color || '#1e1e1e') as any }]}>
        <Text style={[styles.previewCardText, { color: (theme.text_color || '#fff') as any, ...fontStyle }]}>Card Content</Text>
      </View>
      <View style={styles.previewButtons}>
        <View style={[styles.previewButton, { backgroundColor: (theme.primary_color || '#000000') as any }]}>
          <Text style={[styles.previewButtonText, fontStyle]}>{t('theme.button') || 'Follow'}</Text>
        </View>
        <View style={[styles.previewButtonOutline, { borderColor: (theme.primary_color || '#000000') as any }]}>
          <Text style={[styles.previewButtonOutlineText, { color: (theme.primary_color || '#000000') as any, ...fontStyle }]}>
            {t('theme.message') || 'Message'}
          </Text>
        </View>
      </View>
    </>
    );
  };

  const renderPresetsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>{t('theme.colorPresets') || 'Color Presets'}</Text>
      <View style={styles.presetsGrid}>
        {COLOR_PRESETS.map((preset) => (
          <Pressable
            key={preset.name}
            style={[
              styles.presetCard,
              selectedPreset === preset.name && styles.presetCardSelected,
            ]}
            onPress={() => applyPreset(preset)}
          >
            <LinearGradient
              colors={preset.gradient as [string, string]}
              style={styles.presetGradient}
            >
              <View style={[styles.presetDot, { backgroundColor: preset.primary }]} />
            </LinearGradient>
            <Text style={styles.presetName}>{preset.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* Premium Themes */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 8 }}>
        <Ionicons name="star" size={16} color="#f59e0b" />
        <Text style={[styles.sectionTitle, { marginLeft: 6, marginBottom: 0 }]}>
          {t('theme.premiumThemes') || 'Premium Themes'}
        </Text>
      </View>
      <Text style={[styles.sectionHint, { marginBottom: 10 }]}>
        {t('theme.premiumHint') || 'Complete themes with matching box colors & gradients'}
      </Text>
      <View style={styles.presetsGrid}>
        {PREMIUM_PRESETS.map((preset) => (
          <Pressable
            key={preset.name}
            style={[
              styles.presetCard,
              selectedPreset === preset.name && styles.presetCardSelected,
            ]}
            onPress={() => applyPremiumPreset(preset)}
          >
            <LinearGradient
              colors={preset.gradient as [string, string]}
              style={styles.presetGradient}
            >
              <View style={[styles.presetDot, { backgroundColor: preset.primary }]} />
              {preset.useGradient && (
                <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 8, color: '#fff', fontWeight: '600' }}>PRO</Text>
                </View>
              )}
            </LinearGradient>
            <Text style={styles.presetName}>{preset.name}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const renderColorsTab = () => (
    <View style={styles.tabContent}>
      {/* Color Fields - Each with inline color picker */}
      {[
        { key: 'background_color', label: t('theme.background') || 'Background', icon: 'color-fill' },
        { key: 'primary_color', label: t('theme.primary') || 'Primary / Buttons', icon: 'color-palette' },
        { key: 'secondary_color', label: t('theme.secondary') || 'Secondary', icon: 'layers' },
        { key: 'text_color', label: t('theme.text') || 'Text Color', icon: 'text' },
        { key: 'card_color', label: t('theme.card') || 'Card Background', icon: 'card' },
      ].map((field) => (
        <View key={field.key} style={styles.inlineColorSection}>
          <View style={styles.inlineColorHeader}>
            <View style={styles.colorFieldLeft}>
              <Ionicons name={field.icon as any} size={18} color="#888" />
              <Text style={styles.colorFieldLabel}>{field.label}</Text>
            </View>
            <View style={styles.currentColorDisplay}>
              <View 
                style={[
                  styles.colorPreview, 
                  { backgroundColor: (theme as any)[field.key] || '#fff' }
                ]} 
              />
              <Text style={styles.hexCodeText}>{(theme as any)[field.key] || '#fff'}</Text>
            </View>
          </View>
          <View style={styles.inlineColorGrid}>
            {CUSTOM_COLORS.map((color) => (
              <Pressable
                key={`${field.key}-${color}`}
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  (theme as any)[field.key] === color && styles.colorDotSelected,
                ]}
                onPress={() => selectCustomColor(color, field.key)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const renderAdvancedTab = () => (
    <View style={styles.tabContent}>
      {/* Box Colors - Each with inline color picker */}
      <Text style={styles.advancedSectionTitle}>
        <Ionicons name="cube" size={16} color="#000000" /> Box Colors
      </Text>
      {[
        { key: 'gallery_card_color', label: 'Gallery Box', icon: 'images' },
        { key: 'info_card_color', label: 'Info Box', icon: 'information-circle' },
        { key: 'action_button_color', label: 'Action Button', icon: 'flash' },
        { key: 'border_color', label: 'Borders', icon: 'square-outline' },
      ].map((field) => (
        <View key={field.key} style={styles.inlineColorSection}>
          <View style={styles.inlineColorHeader}>
            <View style={styles.colorFieldLeft}>
              <Ionicons name={field.icon as any} size={18} color="#888" />
              <Text style={styles.colorFieldLabel}>{field.label}</Text>
            </View>
            <View style={styles.currentColorDisplay}>
              <View 
                style={[
                  styles.colorPreview, 
                  { backgroundColor: (theme as any)[field.key] || '#fff' }
                ]} 
              />
              <Text style={styles.hexCodeText}>{(theme as any)[field.key] || '#fff'}</Text>
            </View>
          </View>
          <View style={styles.inlineColorGrid}>
            {CUSTOM_COLORS.map((color) => (
              <Pressable
                key={`adv-${field.key}-${color}`}
                style={[
                  styles.colorDot,
                  { backgroundColor: color },
                  (theme as any)[field.key] === color && styles.colorDotSelected,
                ]}
                onPress={() => selectCustomColor(color, field.key)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.fullScreenContainer} edges={['top']}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.title}>{t('theme.customizeTheme') || 'Theme Editor'}</Text>
            <Pressable onPress={resetTheme} style={styles.headerBtn}>
              <Ionicons name="refresh" size={22} color="#888" />
            </Pressable>
          </View>

          {/* Preview */}
          {renderPreview()}

          {/* Tabs */}
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, activeTab === 'presets' && styles.tabActive]}
              onPress={() => setActiveTab('presets')}
            >
              <Ionicons 
                name="color-palette" 
                size={18} 
                color={activeTab === 'presets' ? '#000000' : '#888'} 
              />
              <Text style={[styles.tabText, activeTab === 'presets' && styles.tabTextActive]}>
                Presets
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === 'colors' && styles.tabActive]}
              onPress={() => setActiveTab('colors')}
            >
              <Ionicons 
                name="color-fill" 
                size={18} 
                color={activeTab === 'colors' ? '#000000' : '#888'} 
              />
              <Text style={[styles.tabText, activeTab === 'colors' && styles.tabTextActive]}>
                Colors
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === 'advanced' && styles.tabActive]}
              onPress={() => setActiveTab('advanced')}
            >
              <Ionicons 
                name="settings" 
                size={18} 
                color={activeTab === 'advanced' ? '#000000' : '#888'} 
              />
              <Text style={[styles.tabText, activeTab === 'advanced' && styles.tabTextActive]}>
                Advanced
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === 'fonts' && styles.tabActive]}
              onPress={() => setActiveTab('fonts')}
            >
              <Ionicons 
                name="text" 
                size={18} 
                color={activeTab === 'fonts' ? '#000000' : '#888'} 
              />
              <Text style={[styles.tabText, activeTab === 'fonts' && styles.tabTextActive]}>
                Fonts
              </Text>
            </Pressable>
          </View>

          {/* Tab Content - Scrollable */}
          <ScrollView style={styles.tabContentScroll} contentContainerStyle={styles.tabContentContainer}>
            {activeTab === 'presets' && renderPresetsTab()}
            {activeTab === 'colors' && renderColorsTab()}
            {activeTab === 'advanced' && renderAdvancedTab()}
            {activeTab === 'fonts' && renderFontsTab()}
          </ScrollView>

          {/* Save Button */}
          <View style={styles.footer}>
            <Pressable 
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saveTheme}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.saveText}>{t('theme.saveTheme') || 'Save Theme'}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerBtn: {
    padding: 4,
    width: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  
  // Preview Section
  previewSection: {
    padding: 10,
    paddingBottom: 6,
  },
  previewLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewCard: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewInfo: {
    marginLeft: 10,
    flex: 1,
  },
  previewName: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewBio: {
    fontSize: 11,
    marginTop: 2,
  },
  previewCardInner: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  previewCardText: {
    fontSize: 13,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  previewButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  previewButtonOutline: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  previewButtonOutlineText: {
    fontWeight: '600',
    fontSize: 13,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  tabText: {
    fontSize: 13,
    color: '#888',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '600',
  },

  // Tab Content - Scrollable wrapper
  tabContentScroll: {
    flex: 1,
  },
  tabContentContainer: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  tabContent: {
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Presets
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: '22%',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#252525',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetCardSelected: {
    borderColor: '#000000',
  },
  presetGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  presetDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  presetName: {
    color: '#ccc',
    fontSize: 10,
    fontWeight: '500',
  },

  // Color Fields
  colorField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: '#252525',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colorFieldSelected: {
    borderColor: '#000000',
    backgroundColor: '#2a2a3a',
  },
  colorFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorFieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorFieldLabel: {
    color: '#ddd',
    fontSize: 13,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
  },

  // Color Picker
  colorPicker: {
    backgroundColor: '#1f1f1f',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  colorPickerLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 10,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  hexInputRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  hexInput: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  hexApplyBtn: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  hexApplyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // Inline Color Picker
  inlineColorSection: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  inlineColorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  currentColorDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hexCodeText: {
    color: '#888',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  inlineColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Advanced Tab
  advancedSection: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  advancedSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 14,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: '#ccc',
    fontSize: 14,
  },
  gradientColors: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 16,
  },
  gradientColorBtn: {
    alignItems: 'center',
    gap: 6,
  },
  gradientColorPreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#444',
  },
  gradientColorLabel: {
    color: '#888',
    fontSize: 11,
  },

  // Tips
  tipsSection: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 8,
  },
  tipText: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },

  // Footer
  footer: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    gap: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#000000',
    borderRadius: 12,
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Fonts Tab
  sectionHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    marginTop: -4,
  },
  fontGrid: {
    gap: 10,
  },
  fontCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fontCardSelected: {
    borderColor: '#000000',
    backgroundColor: '#1a3a35',
  },
  fontName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    marginBottom: 4,
  },
  fontNameSelected: {
    color: '#000000',
  },
  fontSample: {
    fontSize: 20,
    color: '#888',
  },
  fontSampleSelected: {
    color: '#fff',
  },
});
