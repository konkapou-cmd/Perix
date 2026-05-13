import { useState, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  FlatList,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AdaptiveVideo from "./AdaptiveVideo";

export type MediaItem = {
  uri: string;
  type: "image" | "video";
  id: string;
};

type Props = {
  visible: boolean;
  mediaArray?: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
};

const { width, height } = Dimensions.get("window");

export default function ImageZoomModal({
  visible,
  mediaArray = [],
  initialIndex = 0,
  onClose,
}: Props) {
  const [scale, setScale] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<MediaItem>>(null);

  const hasMultipleItems = mediaArray.length > 1;
  const currentItem = hasMultipleItems
    ? mediaArray[currentIndex]
    : { uri: mediaArray[0]?.uri || "", type: mediaArray[0]?.type || "image" as const, id: mediaArray[0]?.id || "" };

  const handleZoomIn = () => {
    if (currentItem.type === "image") {
      setScale((prev) => Math.min(prev + 0.5, 4));
    }
  };

  const handleZoomOut = () => {
    if (currentItem.type === "image") {
      setScale((prev) => Math.max(prev - 0.5, 1));
    }
  };

  const handleClose = () => {
    setScale(1);
    setIsMuted(false);
    setCurrentIndex(initialIndex);
    onClose();
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
      setScale(1);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const renderItem = ({ item }: { item: MediaItem }) => (
    <View style={styles.slide}>
      {item.type === "image" ? (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.uri }}
            style={[
              styles.image,
              {
                transform: [{ scale }],
              },
            ]}
            resizeMode="contain"
          />
        </View>
      ) : (
        <View style={styles.videoContainer}>
          <AdaptiveVideo
            uri={item.uri}
            style={styles.video}
            autoPlay
            showMuteButton={true}
            initialMuted={isMuted}
            onMuteChange={setIsMuted}
            useNativeControls={true}
            isLooping={true}
          />
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        {hasMultipleItems && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {mediaArray.length}
            </Text>
          </View>
        )}

        {currentItem.type === "image" ? (
          <>
            <View style={styles.zoomControls}>
              <Pressable
                style={styles.zoomButton}
                onPress={handleZoomOut}
                disabled={scale <= 1}
              >
                <Ionicons
                  name="remove"
                  size={24}
                  color={scale <= 1 ? "rgba(255,255,255,0.3)" : "#fff"}
                />
              </Pressable>
              <Pressable
                style={styles.zoomButton}
                onPress={handleZoomIn}
                disabled={scale >= 4}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={scale >= 4 ? "rgba(255,255,255,0.3)" : "#fff"}
                />
              </Pressable>
            </View>

            <FlatList
              ref={flatListRef}
              data={mediaArray}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: width,
                offset: width * index,
                index,
              })}
            />
          </>
        ) : (
          <FlatList
            ref={flatListRef}
            data={mediaArray}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
          />
        )}

        {currentItem.type === "video" && (
          <Pressable style={styles.muteToggle} onPress={toggleMute}>
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={24}
              color="#fff"
            />
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : 50,
    right: 20,
    zIndex: 100,
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 25,
  },
  counter: {
    position: "absolute",
    top: Platform.OS === "web" ? 25 : 55,
    left: 20,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  counterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  zoomControls: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 30 : 50,
    flexDirection: "row",
    gap: 20,
    zIndex: 100,
  },
  zoomButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    padding: 12,
    borderRadius: 25,
  },
  slide: {
    width: width,
    height: height * 0.85,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: width,
    height: height * 0.8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  image: {
    width: width * 0.9,
    height: height * 0.7,
  },
  videoContainer: {
    width: width * 0.95,
    height: height * 0.8,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  muteToggle: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 30 : 50,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    padding: 12,
    borderRadius: 25,
    zIndex: 100,
  },
});
