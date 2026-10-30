import React from "react";
import { AreaSelectionModal } from "../shared/AreaSelection";

type Props = {
  visible: boolean;
  sessionToken?: string | null;
  nearLat?: number | null;
  nearLng?: number | null;
  onClose: () => void;
  onSelectPlace: (latitude: number, longitude: number, name: string) => void;
  onUseLive?: () => Promise<boolean | void>;
};

/** Home and every map use the same address suggestions and location choices. */
export function LocationSearchOverlay(props: Props) {
  return <AreaSelectionModal {...props} />;
}
