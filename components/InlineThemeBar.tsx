import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ProfileTheme } from '../lib/api';
import { COLORS } from '../lib/designTokens';

// Color presets optimized for quick selection
const QUICK_PRESETS = [
  { id: 'royal',   colors: ['#F3E8FF', '#6A11CB', '#C77DFF'], name: 'Royal' },
  { id: 'gold',    colors: ['#111111', '#D4AF37', '#FFF3CC'], name: 'Gold' },
  { id: 'ocean',   colors: ['#CAF0F8', '#0077B6', '#90E0EF'], name: 'Ocean' },
  { id: 'emerald', colors: ['#D1FAE5', '#27AE60', '#A8E6CF'], name: 'Emerald' },
  { id: 'sunset',  colors: ['#FFF5E1', '#FF6B35', '#FEE9A6'], name: 'Sunset' },
  { id: 'rose',    colors: ['#FCE4EC', '#E91E63', '#F8BBD0'], name: 'Rose' },
  { id: 'teal',    colors: ['#E0FBFC', '#008080', '#94D2BD'], name: 'Teal' },
  { id: 'violet',  colors: ['#E6CCFF', '#7B2CBF', '#C77DFF'], name: 'Violet' },
  { id: 'earthy',  colors: ['#F5EFE6', '#8B5E3C', '#D7B999'], name: 'Earthy' },
  { id: 'ice',     colors: ['#F0FBFC', '#00C4CC', '#CAF0F8'], name: 'Ice' },
  { id: 'red',     colors: ['#FFF5F5', '#C1121F', '#FDF0D5'], name: 'Red' },
  { id: 'lavender',colors: ['#F8F4FF', '#9381FF', '#EADBF8'], name: 'Lavender' },
];

// Quick color palette for individual color selection
const QUICK_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#FF6B6B', '#ec4899', '#ffffff',
  '#a1a1aa', '#52525b', '#18181b', '#000000',
];

// Default theme values
const DEFAULT_THEME: ProfileTheme = {
  background_color: '#121212',
  primary_color: '#000000',
  secondary_color: '#1e1e1e',
  text_color: '#ffffff',
  card_color: '#1e1e1e',
  gradient_start: null,
  gradient_end: null,
  use_gradient: false,
};

type ThemeBarProps = {
  currentTheme?: ProfileTheme | null;
  onThemeChange: (theme: ProfileTheme) => void;
  onSave: () => void;
  saving?: boolean;
  showPreview?: boolean;
};

export default function InlineThemeBar({
  currentTheme,
  onThemeChange,
  onSave,
  saving = false,
  showPreview = true,
}: ThemeBarProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'presets' | 'colors' | 'gradient'>('presets');
  const [selectedColorField, setSelectedColorField] = useState<keyof ProfileTheme | null>(null);
  
  const theme = {
    background_color: currentTheme?.background_color || '#121212',
    primary_color: currentTheme?.primary_color || '#000000',
    secondary_color: currentTheme?.secondary_color || '#1e1e1e',
    text_color: currentTheme?.text_color || '#ffffff',
    card_color: currentTheme?.card_color || '#1e1e1e',
    gradient_start: currentTheme?.gradient_start || null,
    gradient_end: currentTheme?.gradient_end || null,
    use_gradient: currentTheme?.use_gradient || false,
  };

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    onThemeChange({
      ...theme,
      background_color: preset.colors[0],
      primary_color: preset.colors[1],
      secondary_color: preset.colors[0],
      text_color: '#ffffff',
      card_color: preset.colors[0],
      gradient_start: preset.colors[0],
      gradient_end: preset.colors[1],
      use_gradient: false,
    });
  };

  const selectColor = (color: string) => {
    if (!selectedColorField) return;
    onThemeChange({
      ...theme,
      [selectedColorField]: color,
    });
  };

  const toggleGradient = () => {
    onThemeChange({
      ...theme,
      use_gradient: !theme.use_gradient,
      gradient_start: theme.gradient_start || theme.background_color,
      gradient_end: theme.gradient_end || theme.primary_color,
    });
  };

  const resetToDefault = () => {
    onThemeChange({ ...DEFAULT_THEME });
    setSelectedColorField(null);
  };

  return (
    <View style={styles.container}>
      {/* Collapsed Bar - Always Visible */}
      <View style={styles.collapsedBar}>
        <Pressable 
          style={styles.expandToggle}
          onPress={() => setExpanded(!expanded)}
        >
          <Ionicons 
            name="color-palette" 
            size={20} 
            color={theme.primary_color} 
          />
          <Text style={styles.barTitle}>
            {t('theme.profileTheme') || 'Theme'}
          </Text>
          <Ionicons 
            name={expanded ? "chevron-up" : "chevron-down"} 
            size={18} 
            color="#888" 
          />
        </Pressable>
        
        {/* Quick Preview */}
        {showPreview && !expanded && (
          <View style={styles.quickPreview}>
            <View style={[styles.previewDot, { backgroundColor: theme.background_color }]} />
            <View style={[styles.previewDot, { backgroundColor: theme.primary_color }]} />
            <View style={[styles.previewDot, { backgroundColor: theme.text_color }]} />
          </View>
        )}
        
        {/* Reset Button */}
        <Pressable 
          style={styles.resetBtn}
          onPress={resetToDefault}
        >
          <Ionicons name="refresh" size={16} color="#888" />
        </Pressable>
        
        {/* Save Button */}
        <Pressable 
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark" size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* Expanded Panel */}
      {expanded && (
        <View style={styles.expandedPanel}>
          {/* Tabs */}
          <View style={styles.tabs}>
            <Pressable 
              style={[styles.tab, activeTab === 'presets' && styles.tabActive]}
              onPress={() => { setActiveTab('presets'); setSelectedColorField(null); }}
            >
              <Ionicons name="color-palette" size={16} color={activeTab === 'presets' ? '#000000' : '#888'} />
              <Text style={[styles.tabText, activeTab === 'presets' && styles.tabTextActive]}>Presets</Text>
            </Pressable>
            <Pressable 
              style={[styles.tab, activeTab === 'colors' && styles.tabActive]}
              onPress={() => setActiveTab('colors')}
            >
              <Ionicons name="color-fill" size={16} color={activeTab === 'colors' ? '#000000' : '#888'} />
              <Text style={[styles.tabText, activeTab === 'colors' && styles.tabTextActive]}>Colors</Text>
            </Pressable>
            <Pressable 
              style={[styles.tab, activeTab === 'gradient' && styles.tabActive]}
              onPress={() => setActiveTab('gradient')}
            >
              <Ionicons name="color-wand" size={16} color={activeTab === 'gradient' ? '#000000' : '#888'} />
              <Text style={[styles.tabText, activeTab === 'gradient' && styles.tabTextActive]}>Gradient</Text>
            </Pressable>
          </View>

          {/* Tab Content */}
          {activeTab === 'presets' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
              {QUICK_PRESETS.map((preset) => (
                <Pressable
                  key={preset.id}
                  style={styles.presetItem}
                  onPress={() => applyPreset(preset)}
                >
                  <LinearGradient
                    colors={preset.colors as [string, string]}
                    style={styles.presetGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <Text style={styles.presetName}>{preset.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {activeTab === 'colors' && (
            <View style={styles.colorsPanel}>
              {/* Color Field Selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorFieldsRow}>
                {[
                  { key: 'background_color', label: 'BG', icon: 'square' },
                  { key: 'primary_color', label: 'Primary', icon: 'ellipse' },
                  { key: 'text_color', label: 'Text', icon: 'text' },
                  { key: 'card_color', label: 'Card', icon: 'card' },
                ].map((field) => (
                  <Pressable
                    key={field.key}
                    style={[
                      styles.colorFieldBtn,
                      selectedColorField === field.key && styles.colorFieldBtnActive,
                    ]}
                    onPress={() => setSelectedColorField(field.key as keyof ProfileTheme)}
                  >
                    <View 
                      style={[
                        styles.colorFieldPreview, 
                        { backgroundColor: (theme as any)[field.key] || '#fff' }
                      ]} 
                    />
                    <Text style={[
                      styles.colorFieldLabel,
                      selectedColorField === field.key && styles.colorFieldLabelActive,
                    ]}>
                      {field.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              
              {/* Color Palette */}
              {selectedColorField && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPaletteRow}>
                  {QUICK_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorDot,
                        { backgroundColor: color },
                        (theme as any)[selectedColorField] === color && styles.colorDotSelected,
                      ]}
                      onPress={() => selectColor(color)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {activeTab === 'gradient' && (
            <View style={styles.gradientPanel}>
              <Pressable 
                style={styles.gradientToggle}
                onPress={toggleGradient}
              >
                <View style={[
                  styles.gradientSwitch,
                  theme.use_gradient && styles.gradientSwitchOn,
                ]}>
                  <View style={styles.gradientSwitchThumb} />
                </View>
                <Text style={styles.gradientToggleText}>
                  {theme.use_gradient ? 'Gradient ON' : 'Gradient OFF'}
                </Text>
              </Pressable>
              
              {theme.use_gradient && (
                <View style={styles.gradientPreview}>
                  <LinearGradient
                    colors={[theme.gradient_start || '#121212', theme.gradient_end || '#000000']}
                    style={styles.gradientPreviewBox}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.gradientColorPickers}>
                    <Pressable 
                      style={[styles.gradientColorBtn, selectedColorField === 'gradient_start' && styles.gradientColorBtnActive]}
                      onPress={() => setSelectedColorField('gradient_start')}
                    >
                      <View style={[styles.gradientColorPreview, { backgroundColor: theme.gradient_start || '#121212' }]} />
                      <Text style={styles.gradientColorLabel}>Start</Text>
                    </Pressable>
                    <Ionicons name="arrow-forward" size={16} color="#666" />
                    <Pressable 
                      style={[styles.gradientColorBtn, selectedColorField === 'gradient_end' && styles.gradientColorBtnActive]}
                      onPress={() => setSelectedColorField('gradient_end')}
                    >
                      <View style={[styles.gradientColorPreview, { backgroundColor: theme.gradient_end || '#000000' }]} />
                      <Text style={styles.gradientColorLabel}>End</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              
              {selectedColorField && (selectedColorField === 'gradient_start' || selectedColorField === 'gradient_end') && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPaletteRow}>
                  {QUICK_COLORS.map((color) => (
                    <Pressable
                      key={`grad-${color}`}
                      style={[
                        styles.colorDot,
                        { backgroundColor: color },
                        (theme as any)[selectedColorField] === color && styles.colorDotSelected,
                      ]}
                      onPress={() => selectColor(color)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Live Preview */}
          {showPreview && (
            <View style={styles.livePreview}>
              <Text style={styles.previewLabel}>Preview</Text>
              {theme.use_gradient && theme.gradient_start && theme.gradient_end ? (
                <LinearGradient
                  colors={[theme.gradient_start, theme.gradient_end]}
                  style={styles.previewCard}
                >
                  <View style={[styles.previewAvatar, { backgroundColor: theme.primary_color }]} />
                  <Text style={[styles.previewText, { color: theme.text_color }]}>Artist Name</Text>
                  <View style={[styles.previewButton, { backgroundColor: theme.primary_color }]}>
                    <Text style={styles.previewButtonText}>Follow</Text>
                  </View>
                </LinearGradient>
              ) : (
                <View style={[styles.previewCard, { backgroundColor: theme.background_color }]}>
                  <View style={[styles.previewAvatar, { backgroundColor: theme.primary_color }]} />
                  <Text style={[styles.previewText, { color: theme.text_color }]}>Artist Name</Text>
                  <View style={[styles.previewButton, { backgroundColor: theme.primary_color }]}>
                    <Text style={styles.previewButtonText}>Follow</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  expandToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  quickPreview: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 12,
  },
  previewDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  resetBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  saveBtn: {
    backgroundColor: '#000000',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  expandedPanel: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  tabActive: {
    backgroundColor: 'rgba(76, 111, 255, 0.15)',
  },
  tabText: {
    fontSize: 11,
    color: '#888',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  presetsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetItem: {
    alignItems: 'center',
    marginRight: 12,
  },
  presetGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#333',
  },
  presetName: {
    color: '#999',
    fontSize: 10,
    marginTop: 4,
  },
  colorsPanel: {
    paddingHorizontal: 12,
  },
  colorFieldsRow: {
    paddingVertical: 8,
  },
  colorFieldBtn: {
    alignItems: 'center',
    marginRight: 16,
    opacity: 0.7,
  },
  colorFieldBtnActive: {
    opacity: 1,
  },
  colorFieldPreview: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#444',
  },
  colorFieldLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
  },
  colorFieldLabelActive: {
    color: '#000000',
    fontWeight: '600',
  },
  colorPaletteRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 8,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  gradientPanel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gradientToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gradientSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333',
    padding: 2,
  },
  gradientSwitchOn: {
    backgroundColor: '#000000',
  },
  gradientSwitchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  gradientToggleText: {
    color: '#fff',
    fontSize: 13,
  },
  gradientPreview: {
    marginTop: 12,
    alignItems: 'center',
  },
  gradientPreviewBox: {
    width: '100%',
    height: 40,
    borderRadius: 8,
  },
  gradientColorPickers: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 16,
  },
  gradientColorBtn: {
    alignItems: 'center',
    opacity: 0.7,
  },
  gradientColorBtnActive: {
    opacity: 1,
  },
  gradientColorPreview: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#444',
  },
  gradientColorLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 4,
  },
  livePreview: {
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 8,
  },
  previewLabel: {
    color: '#666',
    fontSize: 10,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  previewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  previewText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  previewButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
