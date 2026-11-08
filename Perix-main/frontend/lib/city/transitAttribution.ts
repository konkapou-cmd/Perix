import type { V2MapLine, V2SourceManifest } from "../api/mobility";

/** Credit only the route sources actually returned by the Mobility API. */
export function hasOsmTransitRouting(lines: readonly Pick<V2MapLine, "source">[]): boolean {
  return lines.some(({ source }) => source === "OSM_ROADS" || source === "OSM_RAIL"
    || source === "OSM_ROADS_SEGMENTS" || source === "OSM_RAIL_SEGMENTS");
}

/**
 * Schedule publisher exactly as the version-bound API manifest states it.
 * Only https URLs with a non-empty name qualify; anything else hides the
 * credit instead of guessing a provider or licence.
 */
export function schedulePublisher(manifests: readonly V2SourceManifest[] | null | undefined): { name: string; url: string } | null {
  if (!Array.isArray(manifests)) return null;
  for (const entry of manifests) {
    const publisher = entry?.manifest?.publisher;
    const name = typeof publisher?.publisher_name === "string" ? publisher.publisher_name.trim() : "";
    const url = typeof publisher?.publisher_url === "string" ? publisher.publisher_url.trim() : "";
    if (name.length > 0 && name.length <= 200 && /^https:\/\//.test(url) && !/\s/.test(url) && url.length <= 500) {
      return { name, url };
    }
  }
  return null;
}
