import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type Story = {
  story_id: string;
  image_base64: string;
};

type Props = {
  stories: Story[];
  onViewStory: (index: number) => void;
};

export default function StoriesSection({ stories, onViewStory }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("business.activeStories")}</Text>
      {stories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {stories.map((story, index) => (
            <Pressable
              key={story.story_id}
              onPress={() => onViewStory(index)}
              style={styles.storyItem}
            >
              <Image source={{ uri: story.image_base64 }} style={styles.storyThumb} />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>{t("business.noStories")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  storyItem: {
    marginRight: 12,
  },
  storyThumb: {
    width: 70,
    height: 100,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});
