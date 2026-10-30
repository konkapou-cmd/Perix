import { useOptionalLocation } from "../context/LocationContext";

export function useMapSelection() {
  const context = useOptionalLocation();
  return { position: context?.mapPosition ?? null, mode: context?.locationMode ?? "unset",
    revision: context?.selectionRevision ?? 0, available: !!context };
}
