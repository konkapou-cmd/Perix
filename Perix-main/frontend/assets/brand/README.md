# Perix brand assets

`perix-wordmark.png` is the user's supplied blue/gold Perix artwork, not a
generated replacement. Source: `C:\Users\PC\Downloads\Perix logo.png`.

- Original size: 1448 × 1086.
- Original SHA-256: `7134c42e9e1bfd0971c6add665d4ea7a13402bd17608158a90e89e4abcde8786`.
- Crop rectangle: `(173, 309, 1312, 709)`; output 1139 × 400.
- Only outer whitespace was cropped. Artwork, colours and aspect ratio are
  unchanged. `PerixLogo` uses `contain`, never tinting or stretching the image.
- Existing global app/splash/favicon assets were not overwritten.

`perix-wordmark-el.png` is the Greek artwork supplied by the user (the version
with the compass inside ρ). Source:
`C:\Users\PC\Downloads\ChatGPT Image Oct 25, 2026, 10_46_04 PM-2.png`.
Original SHA-256: `0b632f53a7f602a4a00606d17ba9061eda58ad3d7b3d797f6f28b986d056427c`.
Crop rectangle `(148, 305, 1321, 765)`, output 1173 × 460. Again only outer
whitespace was cropped. The same logo component reads the **existing global
i18next language**: Greek gets Πέριξ, all other app languages get Perix. Its
display slot stays constant, without distorting either image.

## Language flags

The small PNGs in `flags/` are bundled local assets. There are **no runtime CDN
requests** and no automatic refresh. They represent the ten existing app
languages; selecting a flag changes language, not city or account identity.

Source: [Flagpedia / FlagCDN](https://flagpedia.net/download). The provider states
that the flags are public domain and free for commercial and non-commercial
use, based on Wikimedia Commons flag vectors. Download URLs, collection times
and hashes are recorded in `flags/sources.json`.
