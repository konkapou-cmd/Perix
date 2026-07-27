import Constants from "expo-constants";
import { Platform, Alert } from "react-native";

export const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://backend-production-1968.up.railway.app";

export const API_BASE = `${BACKEND_URL}/api`;

if (__DEV__) {
  const resolvedFrom = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL
    ? "Constants.expoConfig.extra"
    : process.env.EXPO_PUBLIC_BACKEND_URL
    ? "process.env"
    : "fallback (api.perixapp.com)";
  console.log(`[API] BACKEND_URL=${BACKEND_URL} (resolved from: ${resolvedFrom})`);
}

export const APP_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_APP_URL ||
  process.env.EXPO_PUBLIC_APP_URL ||
  "https://perix.app";

export type FocalPoint = { x: number; y: number };

export type ProfileTheme = {
  background_color?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  text_color?: string | null;
  card_color?: string | null;
  gradient_start?: string | null;
  gradient_end?: string | null;
  use_gradient?: boolean;
  font_family?: string | null;
  font_weight?: string | null;
  font_style?: string | null;
  letter_spacing?: number | null;
  text_transform?: string | null;
  gallery_card_color?: string | null;
  info_card_color?: string | null;
  action_button_color?: string | null;
  border_color?: string | null;
};

export type GalleryItem = {
  uri: string;
  type: "image" | "video";
  caption?: string;
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  username?: string | null;
  display_name?: string | null;
  picture?: string | null;
  profile_photo?: string | null;
  bio?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cover_photo?: string | null;
  cover_focal_point?: FocalPoint | null;
  theme?: ProfileTheme | null;
  created_at: string;
  gallery_images?: string[];
  gallery_videos?: string[];
  gallery_items?: GalleryItem[];
  video_items?: GalleryItem[];
  video_url?: string | null;
  profile_theme?: ProfileTheme | null;
  creator?: {
    user_id: string;
    name: string;
    profile_photo?: string | null;
  } | null;
  role?: string;
};

export type UserPublic = {
  user_id: string;
  name: string;
  display_name?: string | null;
  profile_photo?: string | null;
  picture?: string | null;
  bio?: string | null;
  location?: string | null;
  gallery_images?: string[];
  gallery_videos?: string[];
  gallery_items?: GalleryItem[];
  cover_photo?: string | null;
  cover_focal_point?: FocalPoint | null;
  theme?: ProfileTheme | null;
  post_count?: number;
  friend_count?: number;
};

export type PostComment = {
  comment_id: string;
  text: string;
  user_id: string;
  created_at: string;
  liked_by_me: boolean;
  likes_count: number;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  author?: { name: string; profile_photo?: string | null; picture?: string | null } | null;
};

export type Post = {
  post_id: string;
  text: string;
  user_id: string;
  image_url?: string | null;
  image_base64?: string | null;
  video_url?: string | null;
  video_status?: string | null;
  mux_thumbnail_url?: string | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  created_at: string;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  author?: { user_id: string; name: string; profile_photo?: string | null; picture?: string | null } | null;
  tagged_user_ids?: string[];
  tagged_business_ids?: string[];
  tagged_artist_ids?: string[];
  media_ratio?: number | null;
  youtube_link?: string | null;
  soundcloud_url?: string | null;
  business_id?: string | null;
};

export type ChatMessage = {
  message_id: string;
  user_id: string;
  from_user_id: string;
  sender_name?: string | null;
  user_name?: string | null;
  text: string;
  created_at: string;
  media_url?: string | null;
  author?: { name: string } | null;
};

export type Message = {
  message_id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  created_at: string;
  media_url?: string | null;
  media_type?: "image" | "video" | "audio" | null;
  read: boolean;
  edited_at?: string | null;
};

export type Conversation = {
  conversation_id: string;
  type: "direct" | "activity" | "event";
  name: string;
  image?: string | null;
  last_message: string | Message;
  last_message_time?: string | null;
  other_user?: UserPublic;
  is_private?: boolean;
  theme?: string | null;
  entity_type?: "user" | "business" | "artist";
  entity_id?: string | null;
  unread_count?: number;
};

export type TaggedBusinessInfo = {
  business_id: string;
  name: string;
  logo_image?: string | null;
};

export type FriendCommon = {
  common_friends: UserPublic[];
  common_count: number;
};

export type EventTheme = {
  slug: string;
  label: string;
  emoji?: string;
  color?: string;
  gradient?: [string, string];
};

export type Artist = {
  artist_id: string;
  owner_id: string;
  name: string;
  bio?: string | null;
  genres: string[];
  socials: Record<string, string>;
  town?: string | null;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gallery_images: string[];
  fan_gallery: string[];
  video_urls: string[];
  youtube_links?: string[];
  profile_photo?: string | null;
  cover_photo?: string | null;
  cover_focal_point?: FocalPoint | null;
  created_at: string;
  theme?: ProfileTheme | null;
};

export type EventItem = {
  event_id: string;
  business_id?: string | null;
  artist_id?: string | null;
  title: string;
  description?: string | null;
  cover_image_url?: string | null;
  image_urls?: string[];
  video_url?: string | null;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  theme?: string | null;
  is_private?: boolean;
  requires_password?: boolean;
  gallery_images?: string[];
  gallery_videos?: string[];
  tagged_artist_ids?: string[];
  tagged_artists?: ArtistSearchResult[];
  artist?: any;
  business?: any;
  creator?: any;
  attendees_count?: number;
  is_attending?: boolean;
  created_at: string;
  profile_theme?: any;
  mux_thumbnail_url?: string | null;
  video_status?: string | null;
  cover_focal_point?: FocalPoint | null;
};

export type ArtistDetail = {
  artist: Artist;
  events: EventItem[];
  posts?: Post[];
};

export type JobItem = {
  job_id: string;
  business_id: string;
  title: string;
  description: string;
  requirements?: string | null;
  salary_range?: string | null;
  job_type: string;
  is_active: boolean;
  created_at: string;
};

export type BookingRequest = {
  request_id: string;
  artist_id: string;
  requester_id: string;
  event_date?: string | null;
  message: string;
  contact_email?: string | null;
  status: string;
  created_at: string;
};

export type SubscriptionPlans = {
  monthly_plan_id: string;
  yearly_plan_id: string;
  trial_days: number;
  monthly_price: number;
  yearly_price: number;
  currency: string;
};

export type SubscriptionResponse = {
  subscription_id: string;
  approval_url: string;
  status: string;
};

export type ActivityInvite = {
  user_id?: string | null;
  email?: string | null;
  status: string;
};

export type TaggedBusinessInActivity = {
  business_id: string;
  name: string;
  logo_image?: string | null;
};

export type ActivityTypeInfo = {
  emoji: string;
  label: string;
  shortLabel: string;
  color: string;
  gradient: [string, string];
  category: string;
  subcategory: string;
};

export const ACTIVITY_TYPES: Record<string, ActivityTypeInfo> = {
  // Movement & Outdoor — Walking Activities
  casual_walk_meetup: { emoji: "🚶", label: "Casual Walk Meetup", shortLabel: "Walk", color: "#4CAF50", gradient: ["#4CAF50", "#388E3C"], category: "movement_outdoor", subcategory: "walking_activities" },
  morning_coffee_walk: { emoji: "☕", label: "Morning Coffee Walk", shortLabel: "Coffee Walk", color: "#8BC34A", gradient: ["#8BC34A", "#689F38"], category: "movement_outdoor", subcategory: "walking_activities" },
  sunset_walk: { emoji: "🌅", label: "Sunset Walk", shortLabel: "Sunset Walk", color: "#FF9800", gradient: ["#FF9800", "#F57C00"], category: "movement_outdoor", subcategory: "walking_activities" },
  // Movement & Outdoor — Light Fitness
  beginner_run_club: { emoji: "🏃", label: "Beginner Run Club", shortLabel: "Run Club", color: "#4CAF50", gradient: ["#4CAF50", "#388E3C"], category: "movement_outdoor", subcategory: "light_fitness" },
  stretching_in_the_park: { emoji: "🧘", label: "Stretching in the Park", shortLabel: "Stretch", color: "#66BB6A", gradient: ["#66BB6A", "#43A047"], category: "movement_outdoor", subcategory: "light_fitness" },
  outdoor_workout_circle: { emoji: "💪", label: "Outdoor Workout Circle", shortLabel: "Workout", color: "#43A047", gradient: ["#43A047", "#2E7D32"], category: "movement_outdoor", subcategory: "light_fitness" },
  // Movement & Outdoor — City Movement
  bike_ride_meetup: { emoji: "🚲", label: "Bike Ride Meetup", shortLabel: "Bike Ride", color: "#2196F3", gradient: ["#2196F3", "#1976D2"], category: "movement_outdoor", subcategory: "city_movement" },
  // Simple Sports — Ball Sports
  casual_football_kickabout: { emoji: "⚽", label: "Casual Football Kickabout", shortLabel: "Football", color: "#FF5722", gradient: ["#FF5722", "#E64A19"], category: "simple_sports", subcategory: "ball_sports" },
  basketball_shootaround: { emoji: "🏀", label: "Basketball Shootaround", shortLabel: "Basketball", color: "#FF7043", gradient: ["#FF7043", "#F4511E"], category: "simple_sports", subcategory: "ball_sports" },
  volleyball_circle: { emoji: "🏐", label: "Volleyball Circle", shortLabel: "Volleyball", color: "#FFC107", gradient: ["#FFC107", "#FFA000"], category: "simple_sports", subcategory: "ball_sports" },
  // Simple Sports — Racket & Easy Games
  frisbee_in_the_park: { emoji: "🥏", label: "Frisbee in the Park", shortLabel: "Frisbee", color: "#00BCD4", gradient: ["#00BCD4", "#0097A7"], category: "simple_sports", subcategory: "racket_easy_games" },
  ping_pong_meetup: { emoji: "🏓", label: "Ping Pong Meetup", shortLabel: "Ping Pong", color: "#9C27B0", gradient: ["#9C27B0", "#7B1FA2"], category: "simple_sports", subcategory: "racket_easy_games" },
  badminton_in_the_park: { emoji: "🏸", label: "Badminton in the Park", shortLabel: "Badminton", color: "#E91E63", gradient: ["#E91E63", "#C2185B"], category: "simple_sports", subcategory: "racket_easy_games" },
  tennis_wall_practice: { emoji: "🎾", label: "Tennis Wall Practice", shortLabel: "Tennis", color: "#CDDC39", gradient: ["#CDDC39", "#AFB42B"], category: "simple_sports", subcategory: "racket_easy_games" },
  // Calm & Wellness — Mindfulness
  meditation_in_the_park: { emoji: "🧘", label: "Meditation in the Park", shortLabel: "Meditation", color: "#7C4DFF", gradient: ["#7C4DFF", "#651FFF"], category: "calm_wellness", subcategory: "mindfulness" },
  gratitude_walk: { emoji: "🙏", label: "Gratitude Walk", shortLabel: "Gratitude Walk", color: "#B388FF", gradient: ["#B388FF", "#9575CD"], category: "calm_wellness", subcategory: "mindfulness" },
  digital_detox_meetup: { emoji: "📵", label: "Digital Detox Meetup", shortLabel: "Detox", color: "#5C6BC0", gradient: ["#5C6BC0", "#3F51B5"], category: "calm_wellness", subcategory: "mindfulness" },
  // Calm & Wellness — Nature & Slow Living
  nature_sit: { emoji: "🌳", label: "Nature Sit", shortLabel: "Nature Sit", color: "#2E7D32", gradient: ["#2E7D32", "#1B5E20"], category: "calm_wellness", subcategory: "nature_slow_living" },
  sunrise_meetup: { emoji: "🌄", label: "Sunrise Meetup", shortLabel: "Sunrise", color: "#FF8F00", gradient: ["#FF8F00", "#FF6F00"], category: "calm_wellness", subcategory: "nature_slow_living" },
  slow_sunday_walk: { emoji: "🐌", label: "Slow Sunday Walk", shortLabel: "Sunday Walk", color: "#A5D6A7", gradient: ["#A5D6A7", "#81C784"], category: "calm_wellness", subcategory: "nature_slow_living" },
  // Social Meetups — Simple Hangouts
  sit_in_the_park_meetup: { emoji: "🪑", label: "Sit in the Park Meetup", shortLabel: "Park Hang", color: "#FF7043", gradient: ["#FF7043", "#F4511E"], category: "social_meetups", subcategory: "simple_hangouts" },
  one_hour_hangout: { emoji: "⏰", label: "One-Hour Hangout", shortLabel: "Hangout", color: "#FFA726", gradient: ["#FFA726", "#FB8C00"], category: "social_meetups", subcategory: "simple_hangouts" },
  bring_your_own_drink_meetup: { emoji: "🥤", label: "Bring Your Own Drink", shortLabel: "BYO Drink", color: "#26C6DA", gradient: ["#26C6DA", "#00BCD4"], category: "social_meetups", subcategory: "simple_hangouts" },
  // Social Meetups — Easy Social Walks
  dog_walk_meetup: { emoji: "🐕", label: "Dog Walk Meetup", shortLabel: "Dog Walk", color: "#8D6E63", gradient: ["#8D6E63", "#6D4C41"], category: "social_meetups", subcategory: "easy_social_walks" },
  playlist_walk: { emoji: "🎧", label: "Playlist Walk", shortLabel: "Playlist Walk", color: "#EC407A", gradient: ["#EC407A", "#D81B60"], category: "social_meetups", subcategory: "easy_social_walks" },
  explore_one_street: { emoji: "🗺️", label: "Explore One Street", shortLabel: "Explore Street", color: "#29B6F6", gradient: ["#29B6F6", "#0288D1"], category: "social_meetups", subcategory: "easy_social_walks" },
  // Social Meetups — Conversation Meetups
  no_agenda_meetup: { emoji: "💬", label: "No Agenda Meetup", shortLabel: "No Agenda", color: "#78909C", gradient: ["#78909C", "#546E7A"], category: "social_meetups", subcategory: "conversation_meetups" },
  bench_talk: { emoji: "🪑", label: "Bench Talk", shortLabel: "Bench Talk", color: "#90A4AE", gradient: ["#90A4AE", "#607D8B"], category: "social_meetups", subcategory: "conversation_meetups" },
};

export const ACTIVITY_CATEGORIES: Record<string, { emoji: string; label: string }> = {
  movement_outdoor: { emoji: "🚶", label: "Movement & Outdoor" },
  simple_sports: { emoji: "⚽", label: "Simple Sports" },
  calm_wellness: { emoji: "🌿", label: "Calm & Wellness" },
  social_meetups: { emoji: "💬", label: "Social Meetups" },
};

export const ACTIVITY_SUBCATEGORIES: Record<string, { label: string; category: string }> = {
  walking_activities:     { label: "Walking", category: "movement_outdoor" },
  light_fitness:          { label: "Light Fitness", category: "movement_outdoor" },
  city_movement:          { label: "City Movement", category: "movement_outdoor" },
  ball_sports:            { label: "Ball Sports", category: "simple_sports" },
  racket_easy_games:      { label: "Racket Games", category: "simple_sports" },
  mindfulness:            { label: "Mindfulness", category: "calm_wellness" },
  nature_slow_living:     { label: "Nature", category: "calm_wellness" },
  simple_hangouts:        { label: "Hangouts", category: "social_meetups" },
  easy_social_walks:      { label: "Walks", category: "social_meetups" },
  conversation_meetups:   { label: "Conversation", category: "social_meetups" },
};

export const ACTIVITY_THEMES = ACTIVITY_TYPES;

export type ActivityItem = {
  activity_id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  date: string;
  time: string;
  start_time?: string | null;
  location?: string | null;
  cover_image_url?: string | null;
  image_urls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  max_attendees?: number | null;
  invites: ActivityInvite[];
  created_at: string;
  my_status: string;
  is_creator: boolean;
  creator?: {
    user_id: string;
    name: string;
    profile_photo?: string | null;
  } | null;
  is_private?: boolean;
  invitation_code?: string | null;
  password?: string | null;
  theme?: string | null;
  custom_theme?: string | null;
  tagged_business?: TaggedBusinessInActivity | null;
  gallery_images?: string[];
  gallery_videos?: string[];
  video_url?: string | null;
  profile_theme?: ProfileTheme | null;
};

export type UserPublicProfile = {
  user: UserPublic;
  posts: Post[];
  activities: ActivityItem[];
};

export type AuthResponse = {
  user: User;
  session_token: string;
  business?: {
    business_id: string;
    name: string;
    root_category: string;
    subcategory: string;
  };
};

export const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const apiRequest = async <T>(
  path: string,
  method: string,
  token?: string | null,
  body?: unknown
): Promise<T> => {
  if (!BACKEND_URL || !API_BASE) {
    throw new Error("Backend URL not configured");
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    let message = `Request failed: ${method} ${path} → ${response.status}`;
    if (data?.detail) {
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(", ");
      else message = JSON.stringify(data.detail);
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return data as T;
};

export const CHUNK_SIZE = 5 * 1024 * 1024;
export const CHUNKED_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

export type UploadProgress = {
  phase: "preparing" | "uploading" | "processing" | "complete";
  progress: number;
};

export interface ExtendedConversation {
  type: "direct" | "activity" | "event";
  conversation_id: string;
  name: string;
  image?: string;
  last_message: string;
  last_message_time?: string;
  other_user?: UserPublic;
  is_private?: boolean;
  theme?: string;
  entity_type?: "user" | "business" | "artist";
  entity_id?: string;
  unread_count?: number;
}

export type FriendRequest = {
  request_id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  from_user?: UserPublic;
  to_user?: UserPublic;
  entity_type?: "user" | "business" | "artist";
  entity_id?: string;
  from_entity_type?: "user" | "business" | "artist";
  from_entity_id?: string;
  to_entity_name?: string;
  to_entity_image?: string;
  from_entity_name?: string;
  from_entity_image?: string;
};

export type EventReminder = {
  reminder_id: string;
  event_id: string;
  user_id: string;
  remind_at: string;
  reminder_type: string;
  status: string;
  created_at: string;
  event_title?: string;
  minutes_before?: number;
};

export type BusinessModules = {
  events: boolean;
  tickets: boolean;
  jobs: boolean;
  bookings: boolean;
  services: boolean;
  menu: boolean;
  rentals: boolean;
  gym: boolean;
  salon: boolean;
};

export type Business = {
  business_id: string;
  owner_id: string;
  name: string;
  category: string;
  root_category: string;
  subcategory: string;
  description?: string | null;
  logo_image?: string | null;
  profile_photo?: string | null;
  cover_image?: string | null;
  cover_focal_point?: FocalPoint | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  social_links?: Record<string, string> | null;
  opening_hours?: Record<string, any> | null;
  gallery_images?: string[];
  gallery_videos?: string[];
  tags?: string[];
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
  enabled_modules?: BusinessModules;
  subscription_status?: string;
  trial_expires_at?: string | null;
  plan_type?: string | null;
  subscription_expires_at?: string | null;
  favorites_count?: number;
  followers_count?: number;
  friends_count?: number;
  theme?: ProfileTheme | null;
};

export type BusinessDetail = {
  business: Business;
  events: EventItem[];
  posts: Post[];
  jobs: any[];
  rentals: Rental[];
  services: Service[];
  is_owner: boolean;
  is_favorited: boolean;
};

export type CategoryGroup = {
  name: string;
  slug: string;
  groups?: {
    name: string;
    slug: string;
    subcategories: {
      name: string;
      slug: string;
      group_slug?: string;
      group_name?: string;
      modules: BusinessModules;
      tools: string[];
    }[];
  }[];
  subcategories?: {
    name: string;
    slug: string;
    group_slug?: string;
    group_name?: string;
    modules: BusinessModules;
    tools: string[];
  }[];
};

export type HomeFeed = {
  posts: Post[];
  events: EventItem[];
  businesses: Business[];
  artists: Artist[];
  activities: ActivityItem[];
  rentals: Rental[];
};

export type Rental = {
  rental_id: string;
  business_id: string;
  business_name?: string | null;
  business_logo?: string | null;
  title: string;
  description?: string | null;
  cover_image?: string | null;
  rent_price?: string | null;
  rooms_size?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  available_from?: string | null;
  deposit?: string | null;
  property_type?: string | null;
  gallery_images?: string[];
  gallery_videos?: string[];
  video_url?: string | null;
  image_urls?: string[];
  is_active?: boolean;
  created_at: string;
  root_category?: string | null;
  subcategory?: string | null;
  distance_km?: number | null;
  cover_focal_point?: FocalPoint | null;
};

export type UserAttendance = {
  activities: ActivityItem[];
  events: EventItem[];
};

export type CallToken = {
  token: string;
  uid: number;
  channel: string;
  app_id: string;
  expiry_time: number;
};

export type CallResponse = {
  call_id: string;
  channel: string;
  token: string;
  app_id: string;
  caller_uid: number;
  callee_uid: number;
  call_type: "voice" | "video";
  status: string;
  caller_token?: string;
  callee_token?: string;
};

export type CallRecord = {
  call_id: string;
  channel: string;
  caller_id: string;
  caller_uid: number;
  callee_id: string;
  callee_uid: number;
  call_type: "voice" | "video";
  status: string;
  created_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  caller?: User;
  other_user?: User;
  is_outgoing?: boolean;
};

export type GroupCallParticipant = {
  user_id: string;
  name: string;
  profile_photo?: string;
  uid: number;
  token: string;
  status: "invited" | "joined" | "left";
  joined_at?: string;
};

export type GroupCallResponse = {
  group_call_id: string;
  channel: string;
  app_id: string;
  call_type: "video" | "voice";
  status: "active" | "ended" | "expired";
  host_id: string;
  host_name: string;
  host_uid: number;
  host_token: string;
  participants: GroupCallParticipant[];
  max_participants: number;
  created_at: string;
  group_name?: string;
};

export type ParticipantTokenResponse = {
  group_call_id: string;
  channel: string;
  token: string;
  uid: number;
  app_id: string;
};

export type BlockedUser = {
  user_id: string;
  name: string;
  profile_photo?: string | null;
};

export type ActivityItemType = {
  activity_id: string;
  type: "like" | "comment" | "friend" | "friend_request" | "event" | "post";
  message: string;
  actor_id: string;
  actor_name: string;
  actor_avatar?: string | null;
  actor_type?: string | null;
  target_id?: string | null;
  target_type?: string | null;
  created_at: string;
  read: boolean;
};

export type ActivityFeedResponse = {
  activities: ActivityItemType[];
  unread_count: number;
};

export type AdminStats = {
  total_users: number;
  hidden_users: number;
  active_users: number;
  total_posts: number;
  hidden_posts: number;
  pending_reports: number;
  total_businesses: number;
  total_artists: number;
};

export type ReportedUser = {
  report_id: string;
  user_id: string;
  name: string;
  email: string;
  profile_photo?: string;
  reported_at: string;
  reported_by: string;
  reporter_name: string;
  reason: string;
  is_hidden: boolean;
  report_count: number;
};

export type UserContentCounts = {
  posts: number;
  activities: number;
  activity_messages: number;
  events: number;
  event_messages: number;
  businesses: number;
  artists: number;
  messages: number;
  conversations: number;
  notifications: number;
  friends: number;
  friend_requests: number;
  reports_about: number;
  reports_by: number;
  calls: number;
  subscriptions: number;
  likes_on_posts: number;
  comments_on_posts: number;
  activity_invites: number;
  total: number;
};

export type VoucherResponse = {
  success: boolean;
  message: string;
  months_free: number;
  expires_at: string;
};

export type VoucherCheckResponse = {
  valid: boolean;
  months_free?: number;
  description?: string;
  message?: string;
};

export type ArtistSearchResult = {
  artist_id: string;
  name: string;
  bio?: string | null;
  genres: string[];
  town?: string | null;
  profile_photo?: string | null;
  cover_photo?: string | null;
  distance_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type PostSearchResult = {
  post_id: string;
  user_id: string;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  text: string;
  image_base64?: string | null;
  video_url?: string | null;
  likes_count: number;
  comments_count: number;
};

export type GeospatialSearchResponse = {
  city: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  artists: ArtistSearchResult[];
  posts: PostSearchResult[];
  total_artists: number;
  total_posts: number;
};

export type MatchedContact = {
  contact_name: string;
  phone_number: string;
  user_id: string;
  user_name: string;
  profile_photo?: string;
  is_friend: boolean;
};

export type InvitableContact = {
  name: string;
  phone_number: string;
};

export type CheckContactsResponse = {
  matched_users: MatchedContact[];
  invitable_contacts: InvitableContact[];
  total_checked: number;
  total_matched: number;
  total_invitable: number;
};

export type UserAnalytics = {
  total_posts: number;
  total_likes_received: number;
  total_comments_received: number;
  total_profile_views: number;
  total_friends: number;
  total_messages_sent: number;
  total_messages_received: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
};

export type ArtistAnalytics = {
  total_followers: number;
  total_profile_views: number;
  total_events: number;
  total_event_attendees: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
  top_events: { event_id: string; title: string; attendees: number; date: string }[];
};

export type BusinessAnalytics = {
  total_followers: number;
  total_profile_views: number;
  total_events: number;
  total_event_attendees: number;
  total_activities: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
  top_events: { event_id: string; title: string; attendees: number; date: string }[];
};

export type SubscriptionPlan = {
  plan_id: string;
  name: string;
  price: number;
  discounted_price?: number;
  interval: string;
  features: string[];
  currency: string;
};

export type VoucherInfo = {
  valid: boolean;
  discount_type?: string;
  monthly_price?: number;
  yearly_price?: number;
  months_free?: number;
  description?: string;
  message?: string;
};

export type PromoterInfo = {
  promoter_id: string;
  promoter_code: string;
  name: string;
  email: string;
  share_percentage: number;
  total_earnings?: number;
  pending_payout?: number;
  total_referrals?: number;
};

export type CheckoutResult = {
  checkout_url: string;
  session_id: string;
  amount: number;
  currency: string;
};

export type CheckoutStatus = {
  status: string;
  payment_status: string;
  subscription_active?: boolean;
  expires_at?: string;
};

export type AdminPromoter = {
  promoter_id: string;
  user_id: string;
  promoter_code: string;
  name: string;
  email: string;
  phone?: string;
  bank_details?: string;
  share_percentage: number;
  total_earnings: number;
  pending_payout: number;
  total_referrals: number;
  created_at: string;
  status: string;
};

export type PaymentTransaction = {
  transaction_id: string;
  business_id: string;
  plan_type: string;
  amount: number;
  currency: string;
  promoter_amount: number;
  payment_status: string;
  created_at: string;
  paid_at?: string;
};

export type Job = {
  job_id: string;
  business_id: string;
  title: string;
  description: string;
  cover_image?: string;
  image_urls?: string[];
  gallery_images?: string[];
  gallery_videos?: string[];
  video_url?: string | null;
  job_type?: string | null;
  requirements?: string | null;
  salary_range?: string | null;
  work_location?: string | null;
  root_category: string;
  subcategory: string;
  location: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  business_name?: string;
  business_logo?: string;
  distance_km?: number;
  cover_focal_point?: FocalPoint | null;
};

export type JobApplication = {
  application_id: string;
  job_id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  message: string;
  cv_url?: string;
  cover_letter_url?: string;
  status: string;
  created_at: string;
};

export type MyApplication = {
  application_id: string;
  job_id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  message: string;
  cv_url?: string;
  cover_letter_url?: string;
  status: string;
  created_at: string;
  job_title?: string;
  business_name?: string;
  business_logo?: string;
  job_location?: string;
};

export const STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥", "💯", "😍"] as const;

export type Story = {
  story_id: string;
  user_id: string;
  actor_type: "user" | "business" | "artist";
  actor_id: string;
  media_url: string;
  media_type: "image" | "video";
  text?: string | null;
  video_status?: string | null;
  mux_asset_id?: string | null;
  mux_playback_id?: string | null;
  mux_thumbnail_url?: string | null;
  duration_seconds?: number | null;
  created_at: string;
  expires_at: string;
  is_hidden?: boolean;
  view_count: number;
  reaction_count: number;
  has_reacted: boolean;
  author_name?: string | null;
  author_avatar?: string | null;
};

export type GroupedStory = {
  user_id: string;
  actor_type: "user" | "business" | "artist";
  actor_id: string;
  author_name?: string | null;
  author_avatar?: string | null;
  stories: Story[];
  has_unseen: boolean;
};

export type StoryReactionsResponse = {
  reactions: {
    user_id: string;
    emoji: string;
    user_name?: string | null;
    user_avatar?: string | null;
  }[];
  total: number;
};

export type StoryHighlight = {
  story_id: string;
  media_url: string;
  media_type: "image" | "video";
  text?: string | null;
  created_at: string;
  view_count: number;
  reaction_count: number;
};

// Services & Bookings
export type ServiceType =
  | "gym_class" | "gym_session" | "gym_membership" | "gym_pass" | "gym_recovery"
  | "salon_appointment" | "salon_package" | "salon_course"
  | "pro_consultation" | "pro_package" | "pro_retainer"
  | "edu_class" | "edu_lesson" | "edu_workshop" | "edu_course"
  | "menu_item"
  | "rental_property"
  | "table_reservation" | "vip_package"
  | "ent_booking" | "ent_performance"
  | "retail_product" | "retail_custom" | "tailoring_alteration" | "custom_order"
  | "auto_vehicle" | "auto_rental" | "auto_repair" | "auto_wash"
  | "health_appointment" | "health_procedure" | "health_test"
  | "pet_appointment" | "pet_product";

export type Service = {
  service_id: string;
  business_id: string;
  type: ServiceType;
  root_category?: string | null;
  name: string;
  description?: string | null;
  price?: string | null;
  duration_minutes?: number | null;
  capacity?: number | null;
  facilities: string[];
  beds?: number | null;
  room_size?: string | null;
  room_number?: string | null;
  menu_category?: string | null;
  dietary_tags: string[];
  image_urls: string[];
  cover_image_url?: string | null;
  gallery_images: string[];
  gallery_videos: string[];
  video_url?: string | null;
  mux_thumbnail_url?: string | null;
  video_status?: string | null;
  cover_focal_point?: FocalPoint | null;
  status?: "draft" | "published" | "hidden";
  sort_order?: number;
  is_active: boolean;
  created_at: string;
  // Per-category fields
  instructor?: string | null;
  difficulty_level?: string | null;
  specialist_name?: string | null;
  service_category?: string | null;
  consultation_type?: string | null;
  meeting_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  size_sqm?: number | null;
  floor?: number | null;
  furnished?: boolean | null;
  available_from?: string | null;
  lease_duration?: string | null;
  max_guests?: number | null;
  property_type?: string | null;
  deposit?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  mileage_km?: number | null;
  fuel_type?: string | null;
  transmission?: string | null;
  stock_status?: string | null;
  brand?: string | null;
  condition?: string | null;
  treatment_type?: string | null;
  session_type?: string | null;
  calories?: number | null;
  allergens: string[];
  spice_level?: number | null;
  duration_days?: number | null;
  duration_months?: number | null;
  includes?: string | null;
  visits_included?: number | null;
  valid_days?: number | null;
  included_services: string[];
  sessions_count?: number | null;
  duration_per_session?: number | null;
  special_requests?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  reason_for_visit?: string | null;
  insurance_info?: string | null;
  pet_name?: string | null;
  pet_type?: string | null;
};

export type TimeSlot = {
  slot_id: string;
  service_id: string;
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  date?: string | null;
  is_recurring: boolean;
  is_blocked: boolean;
  is_booked: boolean;
};

export type SlotAvailability = {
  slot_id: string;
  start_time: string;
  end_time: string;
  capacity: number;
  confirmed_count: number;
  available_spots: number;
  is_full: boolean;
};

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

export type Booking = {
  booking_id: string;
  service_id: string;
  slot_id?: string | null;
  business_id: string;
  client_id: string;
  client_name: string;
  client_email?: string | null;
  date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  guests?: number | null;
  total_price?: string | null;
  status: BookingStatus;
  notes?: string | null;
  created_at: string;
  service_name?: string | null;
  business_name?: string | null;
  pet_name?: string | null;
  pet_type?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  insurance_info?: string | null;
  reason_for_visit?: string | null;
  special_requests?: string | null;
};
