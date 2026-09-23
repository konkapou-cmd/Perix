import React, { Suspense } from "react";
import { View } from "react-native";

const MediaViewer = React.lazy(() => import("./MediaViewer"));

export type { MediaItem } from "./MediaViewer";

type MediaViewerProps = React.ComponentProps<typeof import("./MediaViewer").default>;

export default function LazyMediaViewer(props: MediaViewerProps) {
  return (
    <Suspense fallback={<View />}>
      <MediaViewer {...props} />
    </Suspense>
  );
}
