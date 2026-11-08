type Size = ReturnType<typeof import("image-size-modern").imageSize>;
export function imageSize(input: Uint8Array | string): Size;
export function imageSize(input: string, callback: (error: Error | null, size?: Size) => void): void;
export function disableFS(value: boolean): void;
export const disableTypes: typeof import("image-size-modern").disableTypes;
export const setConcurrency: typeof import("image-size-modern/fromFile").setConcurrency;
export const types: typeof import("image-size-modern").types;
export default imageSize;
