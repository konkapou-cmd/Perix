import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../lib/api/core";
import { DirectoryEntity, EntityKind, getDirectoryDetail } from "../../lib/city/gateway";
import { CityBounds, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { PublicServiceCard } from "./PublicServiceCard";
import { useTranslation } from "react-i18next";
import "../../i18n/city";

export default function CityInlineDetails({ entity, bounds, onSelect }: { entity: DirectoryEntity; bounds: CityBounds; onSelect: (entity: DirectoryEntity) => void }) {
  const { t } = useTranslation("city");
  const [related, setRelated] = useState<DirectoryEntity[]>([]);
  const [relatedError, setRelatedError] = useState(false);
  const [comments, setComments] = useState<{ id: string; text: string; author: string }[]>([]);
  const [commentCursor, setCommentCursor] = useState<number | null>(null);
  const activeEntity = useRef(entity.id); activeEntity.current = entity.id;
  const commentLoading = useRef(false);
  useEffect(() => {
    let active = true;
    setRelated([]); setRelatedError(false);
    setComments([]); setCommentCursor(null);
    commentLoading.current = false;
    if (entity.type === "post") {
      apiRequest<{ items: { id: string; text: string; author: string }[]; next_cursor: number | null }>(`/public-directory/post/${encodeURIComponent(entity.id)}/comments`, "GET")
        .then(page => { if (active) { setComments(page.items); setCommentCursor(page.next_cursor); } })
        .catch(() => { if (active) setRelatedError(true); });
      return () => { active = false; };
    }
    if (!["business", "artist", "user"].includes(entity.type)) return;
    const params = new URLSearchParams({ publisher_id: entity.id, publisher_type: entity.type,
      min_lat: String(bounds.minLat), max_lat: String(bounds.maxLat), min_lng: String(bounds.minLng), max_lng: String(bounds.maxLng) });
    apiRequest<{ items: DirectoryEntity[] }>(`/public-directory/post?${params}`, "GET").then(page => {
      if (active) setRelated(page.items);
    }).catch(() => { if (active) setRelatedError(true); });
    return () => { active = false; };
  }, [entity.id, entity.type, bounds]);
  if (entity.publicService) return <PublicServiceCard service={entity.publicService} full />;
  const openPublisher = async () => {
    if (!entity.publisher_id || !entity.publisher_type) return;
    try { onSelect(await getDirectoryDetail(entity.publisher_type as EntityKind, entity.publisher_id)); }
    catch { setRelatedError(true); }
  };
  return <View style={styles.card}>
    <Text style={styles.title}>{entity.title}</Text>
    {entity.cover_image && <Image source={{ uri: entity.cover_image }} style={styles.image} resizeMode="cover" accessibilityLabel={entity.title} />}
    {entity.address && <Text>{entity.address}</Text>}
    {entity.description && <Text style={styles.text}>{entity.description}</Text>}
    {Object.entries(entity.facts || {}).map(([label, value]) => <Text key={label} style={styles.text}>{label}: {value}</Text>)}
    {entity.images?.filter(url => url !== entity.cover_image).map(url => <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="contain" accessibilityLabel={`Gallery ${entity.title}`} />)}
    {entity.videos?.map(url => <Pressable key={url} accessibilityRole="link" style={styles.button} onPress={() => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); }}><Text style={styles.link}>{t("ui.video")}</Text></Pressable>)}
    {entity.phone && <Pressable accessibilityRole="link" style={styles.button} onPress={() => { void Linking.openURL(`tel:${entity.phone!.replace(/[^+\d]/g, "")}`); }}><Text style={styles.link}>{entity.phone}</Text></Pressable>}
    {entity.website && <Pressable accessibilityRole="link" style={styles.button} onPress={() => { if (/^https?:\/\//i.test(entity.website!)) void Linking.openURL(entity.website!); }}><Text style={styles.link}>{t("ui.website")}</Text></Pressable>}
    {entity.publisher_id && <Pressable accessibilityRole="button" style={styles.button} onPress={openPublisher}><Text style={styles.link}>{t("ui.publisher")}</Text></Pressable>}
    {relatedError && <Text>{t("ui.relatedError")}</Text>}
    {related.length > 0 && <Text style={styles.title}>{t("ui.posts")}</Text>}
    {related.map(post => <Pressable key={post.id} accessibilityRole="button" style={styles.button} onPress={() => onSelect(post)}><Text style={styles.link}>{post.title}</Text></Pressable>)}
    {comments.length > 0 && <Text style={styles.title}>{t("ui.comments")}</Text>}
    {comments.map((comment, i) => <View key={`${comment.id}:${i}`}><Text style={styles.title}>{comment.author}</Text><Text style={styles.text}>{comment.text}</Text></View>)}
    {commentCursor !== null && <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
      if (commentLoading.current) return;
      commentLoading.current = true;
      const postId = entity.id;
      apiRequest<{ items: typeof comments; next_cursor: number | null }>(`/public-directory/post/${encodeURIComponent(postId)}/comments?skip=${commentCursor}`, "GET")
        .then(page => { if (activeEntity.current === postId) { setComments(prev => [...prev, ...page.items]); setCommentCursor(page.next_cursor); } })
        .catch(() => { if (activeEntity.current === postId) setRelatedError(true); })
        .finally(() => { if (activeEntity.current === postId) commentLoading.current = false; });
    }}><Text style={styles.link}>{t("ui.moreComments")}</Text></Pressable>}
  </View>;
}

export function PublicEntityLoader({ kind, id }: { kind: EntityKind; id: string }) {
  const { t } = useTranslation("city");
  const [state, setState] = useState<{ key: string; entity?: DirectoryEntity; error?: boolean }>({ key: "" });
  const key = `${kind}:${id}`;
  useEffect(() => {
    let active = true;
    const request = getDirectoryDetail(kind, id).catch(error => {
      if (kind === "product") return getDirectoryDetail("home", id);
      throw error;
    });
    request.then(entity => { if (active) setState({ key, entity }); }).catch(() => { if (active) setState({ key, error: true }); });
    return () => { active = false; };
  }, [key, kind, id]);
  if (state.key !== key) return <ActivityIndicator />;
  return state.entity ? <CityInlineDetails entity={state.entity} bounds={{ minLat: 52.06, maxLat: 52.22, minLng: 11.52, maxLng: 11.75 }} onSelect={entity => setState({ key, entity })} /> : <Text>{t("ui.unavailable")}</Text>;
}

const styles = StyleSheet.create({ card: { padding: 16, backgroundColor: "#fff", borderRadius: 20, gap: 12 }, title: { fontSize: 22, fontWeight: "700", color: theme.navy }, image: { width: "100%", height: 240, borderRadius: 16 }, text: { lineHeight: 24 }, button: { minHeight: 44, padding: 8, justifyContent: "center" }, link: { color: theme.blue } });
