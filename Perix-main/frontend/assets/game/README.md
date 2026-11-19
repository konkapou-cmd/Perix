# PERIX aircraft

## Current animated model and intro artwork

- `perix-airplane-characters-animated.glb` is copied byte-for-byte from the
  supplied `Perix-Airplane-Final-Characters-Animated-GLB.zip`.
  1,161,364 bytes; SHA256
  `04856c8caf44e99f7f0d34761a8d04b7ba3a900408a678416a4109d2d54d5ae7`.
- Original wing logos plus child/dog characters; five embedded head-animation
  clips. Clips are weighted from existing smoothed steering/pitch, without
  replacing the flight simulation or chase camera with the sample ZIP script.
- Static parts are batched by material and animation root. Moving head rigs
  remain intact. Conservative head envelopes participate in the camera fit.
- `perix-wooden-plane-adventure.png` is the supplied intro picture, shown before
  requesting fullscreen / landscape. 1448x1086, 2,283,482 bytes; SHA256
  `c90a8e778f6efd12dfc59039c2b2832bce348cc4f20f39ce3030f763ffe06317`.
- Fullscreen/orientation support is browser-dependent; unsupported/denied APIs
  do not crash the intro/game. Safari WebKit fullscreen methods are supported
  when present. Portrait phones still show rotation guidance before gameplay.

## Retained original model (inactive archive)

`perix-airplane-original-logo.glb` is copied byte-for-byte from the user-supplied
`Perix-3D-Airplane-Original-Logo-GLB.zip`.

- 706,288 bytes, glTF 2.0, four embedded PNG textures, no external buffers.
- Original Perix logos are embedded on both wings; do not replace/repaint them.
- Local nose -Z, up +Y, right wing +X; wingspan 8.9632 model units.
- Propeller meshes are grouped at runtime for animation; no baked animation.
- Expo Asset resolves a hashed URL, in development as well as web exports.
- SHA256: `84ddd3df52c2202ac194d3ad07cdead4d1eb3baaf407d1ee746235da7f481860`.
