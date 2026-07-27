import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export { FileSystem, Platform, Constants };

export const AGORA_APP_ID =
  Constants?.expoConfig?.extra?.EXPO_PUBLIC_AGORA_APP_ID ||
  process?.env?.EXPO_PUBLIC_AGORA_APP_ID ||
  "";

export {
  BACKEND_URL,
  API_BASE,
  APP_URL,
  apiRequest,
  parseResponse,
  CHUNK_SIZE,
  CHUNKED_UPLOAD_THRESHOLD,
  STORY_REACTIONS,
  ACTIVITY_THEMES,
  ACTIVITY_TYPES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_SUBCATEGORIES,
} from "./api/core";
export type {
  ProfileTheme,
  User,
  GalleryItem,
  TaggedBusinessInfo,
  Post,
  PostComment,
  Story,
  UserPublicProfile,
  FriendCommon,
  ChatMessage,
  Message,
  Conversation,
  UserPublic,
  Business,
  BusinessDetail,
  CategoryGroup,
  EventItem,
  EventTheme,
  Artist,
  ArtistDetail,
  ActivityItem,
  AuthResponse,
  UploadProgress,
  GroupedStory,
  StoryReactionsResponse,
  StoryHighlight,
  ExtendedConversation,
  FriendRequest,
  EventReminder,
  HomeFeed,
  UserAttendance,
  CallToken,
  CallResponse,
  CallRecord,
  GroupCallParticipant,
  GroupCallResponse,
  ParticipantTokenResponse,
  BlockedUser,
  ActivityItemType,
  ActivityFeedResponse,
  AdminStats,
  ReportedUser,
  UserContentCounts,
  VoucherResponse,
  VoucherCheckResponse,
  ArtistSearchResult,
  PostSearchResult,
  GeospatialSearchResponse,
  MatchedContact,
  InvitableContact,
  CheckContactsResponse,
  UserAnalytics,
  ArtistAnalytics,
  BusinessAnalytics,
  SubscriptionPlan,
  VoucherInfo,
  PromoterInfo,
  CheckoutResult,
  CheckoutStatus,
  AdminPromoter,
  PaymentTransaction,
  Rental,
  JobItem,
  JobApplication,
  BookingRequest,
  SubscriptionPlans,
  SubscriptionResponse,
  TaggedBusinessInActivity,
  ActivityInvite,
  Service,
} from "./api/core";

export * from "./api/auth";
export * from "./api/media";
export * from "./api/posts";
export * from "./api/messages";
export * from "./api/businesses";
export * from "./api/events";
export * from "./api/artists";
export * from "./api/activities";
export * from "./api/calls";
export * from "./api/groupCalls";
export * from "./api/jobs";
export * from "./api/rentals";
export * from "./api/services";
export * from "./api/mux";
export * from "./api/social";
export * from "./api/notifications";
export * from "./api/subscriptions";
export * from "./api/admin";
export * from "./api/analytics";
export * from "./api/search";
export * from "./api/contacts";
export * from "./api/profiles";
export * from "./api/slugs";

export * from "./api/saved";

export * from "./api/stories";
export * from "./api/storyAnalytics";

export type { EntityType, FriendshipStatus } from "./api/social";
