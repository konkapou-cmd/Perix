# User-selected UI artwork baseline: v2

The user explicitly selected the output named
`ui-artwork-mask-review-20261109-v2` (259 icons) as the preferred base.
The subsequent high-threshold/automatic-cleanup experiments removed handles,
siren rays, eyeglass frames and chains; they are rejected, not production assets.

`ui-artwork-v2-plan.json` locks the five original source hashes, component
membership, full-contour bounding boxes, lossless WebP hashes and alpha-mask
hashes of that exact v2 output. The current tool must reproduce all 259 images
and masks byte-for-byte, or fail for review:

```text
python scripts/extract-ui-artwork.py --input-dir ORIGINAL_DOWNLOADS_DIRECTORY --output NEW_REVIEW_DIRECTORY
```

This command **does not install images** or modify any source atlas. Some v2
images still contain captions, so v2 is a review baseline, not a finished pack.
Future caption removal must use individually reviewed masks, preserving the
actual figure, thin parts and original soft shadows. Do not apply a new global
alpha/colour threshold or erode the subject to remove text.

Coverage: 37 app/home/root/empty/tab images, 187 Marketplace subcategory images
and 35 services. Dedicated artwork for all 164 business leaf categories and 38
groups is not present in the supplied app overview; do not silently substitute
unrelated images or claim complete coverage of those sets.

## Default workflow for future image batches

This full-contour workflow applies to all future supplied sheets, not only
these five files. New sheets require their own source hashes and reviewed
component assignments; never reuse another sheet's component numbers blindly.

1. Keep the original unchanged and back up existing application assets.
2. Select whole figures with per-image alpha masks, including detached details
   and original soft shadows. Grid cells are mapping hints, never crop lines.
3. Keep transparent safety padding and original RGB/alpha; export losslessly.
4. Review contact sheets plus full-size risky details before applying outputs.
5. Once a baseline is selected, remove captions/dividers only with individually
   annotated unwanted-component masks. Never rebuild all subject masks using a
   higher opacity threshold, colour filter, erosion or smaller bounding window.
6. Require zero changes to protected subject pixels, and keep IDs/routes intact.
7. Leave uncertain overlaps for review rather than trimming the figure.
