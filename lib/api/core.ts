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
  password?: string | null;
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

export const ACTIVITY_THEMES = {
  birthday: { emoji: "🎂", label: "Birthday Party", color: "#ec4899", gradient: ["#ec4899", "#db2777"] },
  dinner: { emoji: "🍽️", label: "Dinner", color: "#f59e0b", gradient: ["#f59e0b", "#d97706"] },
  cinema: { emoji: "🎬", label: "Cinema Night", color: "#6366f1", gradient: ["#6366f1", "#4f46e5"] },
  party: { emoji: "🎉", label: "Party", color: "#FF6B6B", gradient: ["#FF6B6B", "#7c3aed"] },
  sports: { emoji: "🏃", label: "Sports", color: "#10b981", gradient: ["#10b981", "#059669"] },
  coffee: { emoji: "☕", label: "Coffee/Hangout", color: "#78350f", gradient: ["#92400e", "#78350f"] },
  travel: { emoji: "✈️", label: "Travel", color: "#0ea5e9", gradient: ["#0ea5e9", "#0284c7"] },
  game: { emoji: "🎮", label: "Game Night", color: "#dc2626", gradient: ["#dc2626", "#b91c1c"] },
  music: { emoji: "🎵", label: "Concert/Music", color: "#7c3aed", gradient: ["#7c3aed", "#6d28d9"] },
  outdoor: { emoji: "🏕️", label: "Outdoor Activity", color: "#059669", gradient: ["#059669", "#047857"] },
  custom: { emoji: "✨", label: "Custom", color: "#6b7280", gradient: ["#6b7280", "#4b5563"] },
};

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
