# Business Profile - Required Connections

This document tracks all the props, handlers, and state needed for the BusinessView component to function fully.

## BusinessView Props (Required)

```typescript
// Core data
business: BusinessDetail          // Full business data from API
sessionToken: string              // Auth token

// Refresh handler
refreshing: boolean
onRefresh: () => void

// Category tree for event/job creation
categoryTree: CategoryGroup[]

// Opening Hours
openingHours: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>
openHoursModal: () => void

// Social Links  
socialLinks: Record<string, string>
openSocialLinksModal: () => void

// Location (not fully implemented yet)
openLocationModal: () => void

// Gallery - Photos
galleryImages: string[]
handleAddGalleryPhoto: () => void
handleDeleteGalleryImage?: (index: number) => void

// Gallery - Videos
galleryVideos: string[]
handleAddGalleryVideo: () => void
handleDeleteGalleryVideo?: (index: number) => void

// Media Viewer
openMediaViewer: (uri: string, type: 'image' | 'video', index: number) => void

// Images (Logo/Cover)
onUpdateLogo?: () => void
onUpdateCover?: () => void

// Posts
postText: string
setPostText: (text: string) => void
postImage: string | null
postVideo: string | null
postVideoPreview: string | null
pickPostImage: () => void
pickPostVideo: () => void
handleCreatePost: () => Promise<void>

// Stories
openStoryPicker: () => void
openStoryViewer: (index: number) => void

// Events
openEventModal: () => void
handleDeleteEvent: () => void

// Jobs
jobs: any[]
openJobModal: () => void
handleDeleteJob: () => void

// Fan Gallery
fanGalleryPosts: any[]
handleHideFanPost: () => void

// Analytics
analytics: any
analyticsLoading: boolean
loadAnalytics: () => void

// Theme Customizer
themeModalVisible: boolean
setThemeModalVisible: (val: boolean) => void

// Edit Modal
openEditModal: () => void
```

## Required State in profile.tsx

```typescript
// Business detail data
const [businessDetail, setBusinessDetail] = useState<BusinessDetail | null>(null);
const [bizEvents, setBizEvents] = useState<EventItem[]>([]);
const [bizStories, setBizStories] = useState<any[]>([]);
const [bizJobs, setBizJobs] = useState<JobItem[]>([]);
const [bizAnalytics, setBizAnalytics] = useState<any>(null);

// Modal visibility
const [hoursModalVisible, setHoursModalVisible] = useState(false);
const [socialLinksModalVisible, setSocialLinksModalVisible] = useState(false);

// Business editing state
const [businessOpeningHours, setBusinessOpeningHours] = useState<Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>>({});
const [businessSocialLinks, setBusinessSocialLinks] = useState<Record<string, string>>({});
const [bizGalleryImages, setBizGalleryImages] = useState<string[]>([]);
const [bizGalleryVideos, setBizGalleryVideos] = useState<string[]>([]);
```

## Required Handlers in profile.tsx

### Loading Business Data
```typescript
const loadBusinessFullData = async (bizId: string) => {
  const data = await getBusinessDetail(sessionToken, bizId);
  setBusinessDetail(data);
  setBizEvents(data.events || []);
  setBizStories(data.stories || []);
  setBizJobs((data.business as any)?.jobs || []);
  // IMPORTANT: Load editing state
  setBusinessOpeningHours((data.business.opening_hours || {}) as any);
  setBusinessSocialLinks(data.business.social_links || {});
  setBizGalleryImages(data.business.gallery_images || []);
  setBizGalleryVideos(data.business.gallery_videos || []);
};
```

### Save Hours
```typescript
const handleSaveBusinessHours = async () => {
  await updateBusiness(sessionToken, activeIdentity.id, { 
    opening_hours: businessOpeningHours as any 
  });
  setHoursModalVisible(false);
};
```

### Save Social Links
```typescript
const handleSaveBusinessSocialLinks = async () => {
  await updateBusiness(sessionToken, activeIdentity.id, { 
    social_links: businessSocialLinks 
  });
  setSocialLinksModalVisible(false);
};
```

### Add Gallery Photo
```typescript
const handleAddBusinessGalleryPhoto = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.8,
  });
  if (!result.canceled && result.assets[0]) {
    const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
    const newImages = [...bizGalleryImages, imageUrl];
    await updateBusiness(sessionToken, activeIdentity.id, { gallery_images: newImages });
    setBizGalleryImages(newImages);
  }
};
```

### Delete Gallery Image
```typescript
const handleDeleteBusinessGalleryImage = async (index: number) => {
  const newImages = bizGalleryImages.filter((_, i) => i !== index);
  await updateBusiness(sessionToken, activeIdentity.id, { gallery_images: newImages });
  setBizGalleryImages(newImages);
};
```

### Add Gallery Video
```typescript
const handleAddBusinessGalleryVideo = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsEditing: true,
  });
  if (!result.canceled && result.assets[0]) {
    const videoUrl = await uploadMedia(sessionToken, result.assets[0].uri, "video");
    const newVideos = [...bizGalleryVideos, videoUrl];
    await updateBusiness(sessionToken, activeIdentity.id, { gallery_videos: newVideos });
    setBizGalleryVideos(newVideos);
  }
};
```

### Delete Gallery Video
```typescript
const handleDeleteBusinessGalleryVideo = async (index: number) => {
  const newVideos = bizGalleryVideos.filter((_, i) => i !== index);
  await updateBusiness(sessionToken, activeIdentity.id, { gallery_videos: newVideos });
  setBizGalleryVideos(newVideos);
};
```

### Update Logo
```typescript
const handleUpdateBusinessLogo = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (!result.canceled && result.assets[0]) {
    const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
    await updateBusiness(sessionToken, activeIdentity.id, { logo_image: imageUrl });
    await loadBusinessFullData(activeIdentity.id);
  }
};
```

### Update Cover
```typescript
const handleUpdateBusinessCover = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.8,
  });
  if (!result.canceled && result.assets[0]) {
    const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
    await updateBusiness(sessionToken, activeIdentity.id, { cover_image: imageUrl });
    await loadBusinessFullData(activeIdentity.id);
  }
};
```

## Reorder Gallery Images
```typescript
const handleMoveGalleryImage = async (fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex) return;
  const newImages = [...galleryImages];
  const [movedItem] = newImages.splice(fromIndex, 1);
  newImages.splice(toIndex, 0, movedItem);
  await updateBusiness(sessionToken, detail.business.business_id, { gallery_images: newImages });
  onRefresh();
};
```

## Reorder Gallery Videos
```typescript
const handleMoveGalleryVideo = async (fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex) return;
  const newVideos = [...galleryVideos];
  const [movedItem] = newVideos.splice(fromIndex, 1);
  newVideos.splice(toIndex, 0, movedItem);
  await updateBusiness(sessionToken, detail.business.business_id, { gallery_videos: newVideos });
  onRefresh();
};
```

## BusinessView Usage in JSX

```tsx
<BusinessView
  business={businessDetail}
  sessionToken={sessionToken || ""}
  refreshing={refreshing}
  onRefresh={onRefresh}
  categoryTree={categoryTree}
  openCategoryModal={() => {}}
  openEventModal={() => {}}
  handleDeleteEvent={() => {}}
  postText={postText}
  setPostText={setPostText}
  postImage={postImage}
  postVideo={postVideo}
  postVideoPreview={postVideoPreview}
  pickPostImage={() => {}}
  pickPostVideo={() => {}}
  handleCreatePost={handleCreatePost}
  openStoryPicker={() => {}}
  openStoryViewer={(index) => {
    setStoryViewerIndex(index);
    setStoryViewerVisible(true);
  }}
  jobs={bizJobs as any[]}
  openJobModal={() => {}}
  handleDeleteJob={() => {}}
  fanGalleryPosts={[]}
  handleHideFanPost={() => {}}
  openingHours={businessOpeningHours}
  openHoursModal={() => setHoursModalVisible(true)}
  openLocationModal={() => {}}
  socialLinks={businessSocialLinks}
  openSocialLinksModal={() => setSocialLinksModalVisible(true)}
  galleryImages={bizGalleryImages}
  galleryVideos={bizGalleryVideos}
  handleAddGalleryPhoto={handleAddBusinessGalleryPhoto}
  handleAddGalleryVideo={handleAddBusinessGalleryVideo}
  handleDeleteGalleryImage={handleDeleteBusinessGalleryImage}
  handleDeleteGalleryVideo={handleDeleteBusinessGalleryVideo}
  openMediaViewer={() => {}}
  onUpdateLogo={handleUpdateBusinessLogo}
  onUpdateCover={handleUpdateBusinessCover}
  analytics={bizAnalytics}
  analyticsLoading={false}
  loadAnalytics={() => {}}
  themeModalVisible={themeModalVisible}
  setThemeModalVisible={setThemeModalVisible}
  openEditModal={() => setEditModalVisible(true)}
/>
```

## Required Modals to Render

```tsx
{/* Opening Hours Modal */}
<OpeningHoursModal
  visible={hoursModalVisible}
  onClose={() => setHoursModalVisible(false)}
  openingHours={businessOpeningHours}
  onHoursChange={setBusinessOpeningHours}
  onSave={handleSaveBusinessHours}
/>

{/* Social Links Modal */}
<SocialLinksModal
  visible={socialLinksModalVisible}
  onClose={() => setSocialLinksModalVisible(false)}
  socials={businessSocialLinks}
  onSocialsChange={setBusinessSocialLinks}
  youtubeUrl=""
  onYoutubeUrlChange={() => {}}
  onSave={handleSaveBusinessSocialLinks}
/>
```

## Null-Safe Object Handling

In BusinessView, always check for undefined before using Object.keys() or Object.entries():

```tsx
// WRONG - will crash if undefined
{Object.keys(socialLinks).length > 0 && ...}

// CORRECT - safe
{socialLinks && Object.keys(socialLinks).length > 0 && ...}
```

## ProfileTheme Type (Extended)

```typescript
type ProfileTheme = {
  background_color?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  text_color?: string | null;
  card_color?: string | null;
  gradient_start?: string | null;
  gradient_end?: string | null;
  use_gradient?: boolean;
  font_family?: string | null;
  font_weight?: string | null;      // Added
  font_style?: string | null;        // Added
  letter_spacing?: number | null;   // Added
  text_transform?: string | null;    // Added
  gallery_card_color?: string | null;
  info_card_color?: string | null;
  action_button_color?: string | null;
  border_color?: string | null;
};
```

## Font Styles Available

```typescript
const FONT_OPTIONS = [
  { id: 'default', name: 'Classic', fontFamily: undefined, fontWeight: '400' },
  { id: 'bold-modern', name: 'Bold Modern', fontFamily: 'sans-serif', fontWeight: '700' },
  { id: 'elegant-serif', name: 'Elegant Serif', fontFamily: 'serif', fontWeight: '500', fontStyle: 'italic' },
  { id: 'condensed', name: 'Condensed', fontFamily: 'sans-serif-condensed', fontWeight: '300', letterSpacing: 2, textTransform: 'uppercase' },
  { id: 'script', name: 'Script', fontFamily: 'cursive', fontWeight: '400' },
  { id: 'mono-tech', name: 'Tech Mono', fontFamily: 'monospace', fontWeight: '400' },
  { id: 'display', name: 'Display', fontFamily: 'sans-serif', fontWeight: '900', fontStyle: 'italic' },
  { id: 'vintage', name: 'Vintage', fontFamily: 'serif', fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  { id: 'clean', name: 'Clean', fontFamily: 'sans-serif', fontWeight: '300' },
  { id: 'urban', name: 'Urban', fontFamily: 'sans-serif', fontWeight: '800', textTransform: 'uppercase' },
  { id: 'artistic', name: 'Artistic', fontFamily: 'cursive', fontWeight: '400', fontStyle: 'italic' },
  { id: 'retro', name: 'Retro', fontFamily: 'monospace', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
];
```

## Color Picker Colors

```typescript
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
  '#FF6B6B', '#a855f7', '#9333ea', '#7c3aed',
  // Pinks
  '#d946ef', '#ec4899', '#db2777', '#be185d',
  // Neutrals
  '#ffffff', '#f5f5f5', '#e5e5e5', '#a1a1aa', '#71717a',
  '#52525b', '#3f3f46', '#27272a', '#18181b', '#000000',
];
```

## ThemeCustomizer Props

```typescript
<ThemeCustomizer
  visible={themeModalVisible}
  onClose={() => setThemeModalVisible(false)}
  currentTheme={businessDetail?.business?.theme}
  sessionToken={sessionToken || ""}
  onThemeUpdated={loadBusinessFullData}
  saveThemeOverride={async (theme) => {
    await updateBusinessTheme(sessionToken, businessDetail.business.business_id, theme);
  }}
/>
```

## API Functions Used

```typescript
// From lib/api.ts
getBusinessDetail(sessionToken, bizId)
updateBusiness(sessionToken, bizId, payload)
updateBusinessTheme(sessionToken, bizId, theme)
uploadMedia(sessionToken, uri, type, onProgress?)

// From expo-image-picker
ImagePicker.launchImageLibraryAsync(options)
```
