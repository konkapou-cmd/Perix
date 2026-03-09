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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { updateProfileTheme, ProfileTheme } from '../lib/api';

// Extended color presets with gradient options
const COLOR_PRESETS = [
  { 
    name: 'Ocean', 
    background: '#0a192f', 
    primary: '#64ffda', 
    secondary: '#112240', 
    text: '#ccd6f6',
    accent: '#64ffda',
    gradient: ['#0a192f', '#112240'],
  },
  { 
    name: 'Sunset', 
    background: '#1a1a2e', 
    primary: '#e94560', 
    secondary: '#16213e', 
    text: '#eaeaea',
    accent: '#f97316',
    gradient: ['#1a1a2e', '#e94560'],
  },
  { 
    name: 'Forest', 
    background: '#1b2d1b', 
    primary: '#4ade80', 
    secondary: '#2d4a2d', 
    text: '#e0f0e0',
    accent: '#22c55e',
    gradient: ['#1b2d1b', '#2d4a2d'],
  },
  { 
    name: 'Royal', 
    background: '#1e1e3f', 
    primary: '#a855f7', 
    secondary: '#3b3b6b', 
    text: '#f0e0ff',
    accent: '#8b5cf6',
    gradient: ['#1e1e3f', '#4c1d95'],
  },
  { 
    name: 'Flame', 
    background: '#1f1f1f', 
    primary: '#f59e0b', 
    secondary: '#3d3d3d', 
    text: '#fef3c7',
    accent: '#ef4444',
    gradient: ['#1f1f1f', '#451a03'],
  },
  { 
    name: 'Midnight', 
    background: '#0f0f23', 
    primary: '#3b82f6', 
    secondary: '#1e3a5f', 
    text: '#e0f2fe',
    accent: '#06b6d4',
    gradient: ['#0f0f23', '#1e3a5f'],
  },
  { 
    name: 'Rose', 
    background: '#2d1f2d', 
    primary: '#ec4899', 
    secondary: '#4a2d4a', 
    text: '#fce7f3',
    accent: '#f43f5e',
    gradient: ['#2d1f2d', '#831843'],
  },
  { 
    name: 'Neon', 
    background: '#0a0a0a', 
    primary: '#00ff88', 
    secondary: '#1a1a1a', 
    text: '#ffffff',
    accent: '#00ffff',
    gradient: ['#0a0a0a', '#1a0a2e'],
  },
  { 
    name: 'Warm', 
    background: '#1c1917', 
    primary: '#fb923c', 
    secondary: '#292524', 
    text: '#fef3c7',
    accent: '#fbbf24',
    gradient: ['#1c1917', '#451a03'],
  },
  { 
    name: 'Default', 
    background: '#121212', 
    primary: '#4c6fff', 
    secondary: '#1e1e1e', 
    text: '#ffffff',
    accent: '#4c6fff',
    gradient: ['#121212', '#1e1e1e'],
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
  '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  // Purples
  '#8b5cf6', '#a855f7', '#9333ea', '#7c3aed',
  // Pinks
  '#d946ef', '#ec4899', '#db2777', '#be185d',
  // Neutrals
  '#ffffff', '#f5f5f5', '#e5e5e5', '#a1a1aa', '#71717a',
  '#52525b', '#3f3f46', '#27272a', '#18181b', '#000000',
];

// Font options for profile
const FONT_OPTIONS = [
  { id: 'default', name: 'Default', style: {} },
  { id: 'modern', name: 'Modern', style: { letterSpacing: 0.5 } },
  { id: 'elegant', name: 'Elegant', style: { letterSpacing: 1 } },
  { id: 'bold', name: 'Bold', style: { fontWeight: '700' } },
  { id: 'light', name: 'Light', style: { fontWeight: '300' } },
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
};

type TabType = 'presets' | 'colors' | 'advanced';

export default function ThemeCustomizer({
  visible,
  onClose,
  currentTheme,
  sessionToken,
  onThemeUpdated,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<keyof ProfileTheme | null>(null);
  const [theme, setTheme] = useState<ProfileTheme>({
    background_color: currentTheme?.background_color || '#121212',
    primary_color: currentTheme?.primary_color || '#4c6fff',
    secondary_color: currentTheme?.secondary_color || '#1e1e1e',
    text_color: currentTheme?.text_color || '#ffffff',
    card_color: currentTheme?.card_color || '#1e1e1e',
    gradient_start: currentTheme?.gradient_start || null,
    gradient_end: currentTheme?.gradient_end || null,
    use_gradient: currentTheme?.use_gradient || false,
  });
  const [saving, setSaving] = useState(false);
  const [customHex, setCustomHex] = useState('');

  // Reset theme state when modal opens
  useEffect(() => {
    if (visible) {
      setTheme({
        background_color: currentTheme?.background_color || '#121212',
        primary_color: currentTheme?.primary_color || '#4c6fff',
        secondary_color: currentTheme?.secondary_color || '#1e1e1e',
        text_color: currentTheme?.text_color || '#ffffff',
        card_color: currentTheme?.card_color || '#1e1e1e',
        gradient_start: currentTheme?.gradient_start || null,
        gradient_end: currentTheme?.gradient_end || null,
        use_gradient: currentTheme?.use_gradient || false,
      });
      setSelectedPreset(null);
      setSelectedField(null);
    }
  }, [visible, currentTheme]);

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    setTheme({
      background_color: preset.background,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      text_color: preset.text,
      card_color: preset.secondary,
      gradient_start: preset.gradient[0],
      gradient_end: preset.gradient[1],
      use_gradient: false,
    });
  };

  const selectCustomColor = (color: string) => {
    if (!selectedField) return;
    setTheme(prev => ({ ...prev, [selectedField]: color }));
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
      await updateProfileTheme(sessionToken, theme);
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
      background_color: '#121212',
      primary_color: '#4c6fff',
      secondary_color: '#1e1e1e',
      text_color: '#ffffff',
      card_color: '#1e1e1e',
      gradient_start: null,
      gradient_end: null,
      use_gradient: false,
    });
    setSelectedPreset(null);
    setSelectedField(null);
  };

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
        <View style={[styles.previewCard, { backgroundColor: theme.background_color || '#121212' }]}>
          {renderPreviewContent()}
        </View>
      )}
    </View>
  );

  const renderPreviewContent = () => (
    <>
      <View style={styles.previewHeader}>
        <View style={[styles.previewAvatar, { backgroundColor: theme.primary_color }]}>
          <Ionicons name="person" size={20} color={theme.text_color || '#fff'} />
        </View>
        <View style={styles.previewInfo}>
          <Text style={[styles.previewName, { color: theme.text_color }]}>Username</Text>
          <Text style={[styles.previewBio, { color: theme.text_color, opacity: 0.7 }]}>Bio text here</Text>
        </View>
      </View>
      <View style={[styles.previewCardInner, { backgroundColor: theme.card_color || theme.secondary_color }]}>
        <Text style={[styles.previewCardText, { color: theme.text_color }]}>Card Content</Text>
      </View>
      <View style={styles.previewButtons}>
        <View style={[styles.previewButton, { backgroundColor: theme.primary_color }]}>
          <Text style={styles.previewButtonText}>{t('theme.button') || 'Follow'}</Text>
        </View>
        <View style={[styles.previewButtonOutline, { borderColor: theme.primary_color }]}>
          <Text style={[styles.previewButtonOutlineText, { color: theme.primary_color }]}>
            {t('theme.message') || 'Message'}
          </Text>
        </View>
      </View>
    </>
  );

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
              colors={preset.gradient}
              style={styles.presetGradient}
            >
              <View style={[styles.presetDot, { backgroundColor: preset.primary }]} />
            </LinearGradient>
            <Text style={styles.presetName}>{preset.name}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const renderColorsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Color Fields */}
      {[
        { key: 'background_color', label: t('theme.background') || 'Background', icon: 'color-fill' },
        { key: 'primary_color', label: t('theme.primary') || 'Primary / Buttons', icon: 'color-palette' },
        { key: 'secondary_color', label: t('theme.secondary') || 'Secondary', icon: 'layers' },
        { key: 'text_color', label: t('theme.text') || 'Text Color', icon: 'text' },
        { key: 'card_color', label: t('theme.card') || 'Card Background', icon: 'card' },
      ].map((field) => (
        <View key={field.key}>
          <Pressable
            style={[
              styles.colorField,
              selectedField === field.key && styles.colorFieldSelected,
            ]}
            onPress={() => setSelectedField(
              selectedField === field.key ? null : field.key as keyof ProfileTheme
            )}
          >
            <View style={styles.colorFieldLeft}>
              <Ionicons name={field.icon as any} size={18} color="#888" />
              <Text style={styles.colorFieldLabel}>{field.label}</Text>
            </View>
            <View style={styles.colorFieldRight}>
              <View 
                style={[
                  styles.colorPreview, 
                  { backgroundColor: (theme as any)[field.key] || '#fff' }
                ]} 
              />
              <Ionicons 
                name={selectedField === field.key ? "chevron-up" : "chevron-down"} 
                size={16} 
                color="#666" 
              />
            </View>
          </Pressable>
          
          {/* Color Picker Grid */}
          {selectedField === field.key && (
            <View style={styles.colorPicker}>
              <View style={styles.colorGrid}>
                {CUSTOM_COLORS.map((color) => (
                  <Pressable
                    key={`${field.key}-${color}`}
                    style={[
                      styles.colorDot,
                      { backgroundColor: color },
                      (theme as any)[field.key] === color && styles.colorDotSelected,
                    ]}
                    onPress={() => selectCustomColor(color)}
                  />
                ))}
              </View>
              {/* Custom Hex Input */}
              <View style={styles.hexInputRow}>
                <TextInput
                  style={styles.hexInput}
                  placeholder="#FF0000"
                  placeholderTextColor="#666"
                  value={customHex}
                  onChangeText={setCustomHex}
                  autoCapitalize="characters"
                  maxLength={7}
                />
                <Pressable style={styles.hexApplyBtn} onPress={applyCustomHex}>
                  <Text style={styles.hexApplyText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );

  const renderAdvancedTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Gradient Toggle */}
      <View style={styles.advancedSection}>
        <Text style={styles.advancedSectionTitle}>
          <Ionicons name="color-wand" size={16} color="#4c6fff" /> Gradient Background
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable Gradient</Text>
          <Switch
            value={theme.use_gradient || false}
            onValueChange={(value) => {
              setTheme(prev => ({
                ...prev,
                use_gradient: value,
                gradient_start: value ? (prev.gradient_start || prev.background_color) : null,
                gradient_end: value ? (prev.gradient_end || prev.secondary_color) : null,
              }));
            }}
            trackColor={{ false: '#333', true: '#4c6fff' }}
            thumbColor="#fff"
          />
        </View>
        
        {theme.use_gradient && (
          <View style={styles.gradientColors}>
            <Pressable 
              style={styles.gradientColorBtn}
              onPress={() => setSelectedField('gradient_start')}
            >
              <View style={[styles.gradientColorPreview, { backgroundColor: theme.gradient_start || '#121212' }]} />
              <Text style={styles.gradientColorLabel}>Start</Text>
            </Pressable>
            <Ionicons name="arrow-forward" size={20} color="#666" />
            <Pressable 
              style={styles.gradientColorBtn}
              onPress={() => setSelectedField('gradient_end')}
            >
              <View style={[styles.gradientColorPreview, { backgroundColor: theme.gradient_end || '#1e1e1e' }]} />
              <Text style={styles.gradientColorLabel}>End</Text>
            </Pressable>
          </View>
        )}
        
        {(selectedField === 'gradient_start' || selectedField === 'gradient_end') && (
          <View style={styles.colorPicker}>
            <Text style={styles.colorPickerLabel}>
              Select {selectedField === 'gradient_start' ? 'Start' : 'End'} Color:
            </Text>
            <View style={styles.colorGrid}>
              {CUSTOM_COLORS.slice(0, 30).map((color) => (
                <Pressable
                  key={`gradient-${color}`}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    (theme as any)[selectedField] === color && styles.colorDotSelected,
                  ]}
                  onPress={() => {
                    setTheme(prev => ({ ...prev, [selectedField!]: color }));
                    setSelectedField(null);
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Quick Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipTitle}>
          <Ionicons name="bulb" size={14} color="#f59e0b" /> Tips
        </Text>
        <Text style={styles.tipText}>
          • Use contrasting colors for text and background
        </Text>
        <Text style={styles.tipText}>
          • Primary color is used for buttons and highlights
        </Text>
        <Text style={styles.tipText}>
          • Gradients work best with similar color families
        </Text>
      </View>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
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
                color={activeTab === 'presets' ? '#4c6fff' : '#888'} 
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
                color={activeTab === 'colors' ? '#4c6fff' : '#888'} 
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
                color={activeTab === 'advanced' ? '#4c6fff' : '#888'} 
              />
              <Text style={[styles.tabText, activeTab === 'advanced' && styles.tabTextActive]}>
                Advanced
              </Text>
            </Pressable>
          </View>

          {/* Tab Content */}
          <View style={styles.tabContentContainer}>
            {activeTab === 'presets' && renderPresetsTab()}
            {activeTab === 'colors' && renderColorsTab()}
            {activeTab === 'advanced' && renderAdvancedTab()}
          </View>

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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
    padding: 16,
    paddingBottom: 8,
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewInfo: {
    marginLeft: 12,
    flex: 1,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '600',
  },
  previewBio: {
    fontSize: 12,
    marginTop: 2,
  },
  previewCardInner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
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
    borderBottomColor: '#4c6fff',
  },
  tabText: {
    fontSize: 13,
    color: '#888',
  },
  tabTextActive: {
    color: '#4c6fff',
    fontWeight: '600',
  },

  // Tab Content
  tabContentContainer: {
    height: 280,
  },
  tabContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Presets
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
    borderColor: '#4c6fff',
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
    borderColor: '#4c6fff',
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
    backgroundColor: '#4c6fff',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  hexApplyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // Advanced Tab
  advancedSection: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  advancedSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
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
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#4c6fff',
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
});
