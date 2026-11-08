import React from "react";

export default function GoogleDirectionsFrame({ src, title, onError }: {
  src: string; title: string; onError: () => void;
}) {
  return <iframe data-testid="google-directions-frame" src={src} title={title}
    referrerPolicy="strict-origin-when-cross-origin" allowFullScreen onError={onError}
    style={{ display: "block", width: "100%", height: 300, minWidth: 200, border: 0 }} />;
}
