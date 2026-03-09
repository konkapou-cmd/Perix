import { useState } from "react";
import {
  Modal,
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
};

const { width, height } = Dimensions.get("window");

export default function ImageZoomModal({ visible, imageUri, onClose }: Props) {
  const [scale, setScale] = useState(1);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.5, 1));
  };

  const handleClose = () => {
    setScale(1);
    onClose();
  };

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

        <View style={styles.zoomControls}>
          <Pressable style={styles.zoomButton} onPress={handleZoomOut}>
            <Ionicons name="remove" size={24} color="#fff" />
          </Pressable>
          <Pressable style={styles.zoomButton} onPress={handleZoomIn}>
            <Ionicons name="add" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              {
                transform: [{ scale }],
              },
            ]}
            resizeMode="contain"
          />
        </View>
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
});
