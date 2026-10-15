# Desktop graphics

The normal jar body has three children, in paint order:

1. `desktop-jars/*-lower.webp`: base plus all manifest layers with `placement: interior`.
2. One SVG: clipped pollen (with an erase mask only while erasing/restoring), then moving berries with their own glass clip and multiply blend.
3. `desktop-jars/*-upper.webp`: all remaining manifest layers, including layers without a placement (legacy foreground).

`scripts/desktop-jars.mjs` creates these lossless WebP assets during the Vite build. They fit within 1024 × 1024, enough for the current maximum 430 CSS-pixel jar at 2× density. Original source layers and manifests remain editable. Changes to their contents, glass polygon or settings invalidate the generated filenames. Geometry and initial berry placement are computed during the build, rather than reading all textures back through browser canvases.

Foreground multiply/luminosity/color-burn modes depend on the backdrop and cannot in general be represented exactly by a single normal-alpha image over arbitrary moving content. The generator composites the reference stack against the lower image, then extracts a transparent overlay that reconstructs that static appearance. The original foreground coverage is retained where possible. Blending with animated lights/berries is an approximation; compare that interaction visually when changing the artwork. The automated comparison of all seven shipped jars limits static premultiplied color error to 2/255, including transparent edges.

Shattering loads `*-whole.webp` on demand and uses one image per shard instead of the entire source stack. The two normal texture layers remain mounted for reassembly. External hover dust is a separate temporary effect, mounted only for the hovered/focused jar and its fade-out.

## Animation work

- All berry/pollen simulations share one requestAnimationFrame clock, capped at approximately 60 updates/s on fast displays. Delta time is bounded and reset after suspension.
- Hidden tabs, reduced-motion preferences, off-screen jars, and open projects/CV stop the relevant simulations. Jar CSS animation also pauses behind projects/CV and in hidden tabs.
- Hover dust no longer runs 504 invisible SVG animations across all seven jars at rest.
- The cursor schedules frames only while it moves and settles.
- Erase restoration updates mask radii directly instead of rendering the whole React jar every frame. Its completion timer also works if reduced motion is enabled during restoration.
- Videos pause in hidden tabs and resume the existing source on return. Inactive gallery videos still release their sources as before.
- Number labels blend individually, avoiding a viewport-sized difference-blend surface and missing labels after initial dark-theme composition.

## Measured asset changes

| Initial jar textures, seven jars | Before | After |
| --- | ---: | ---: |
| Images | 143 | 14 |
| Encoded bytes | 22,483,934 | 9,350,496 |
| Decoded pixels | 224,869,788 | 14,680,064 |
| Approximate RGBA storage | 899 MB | 59 MB |

These are asset/DOM counts, not measured GPU memory or CPU percentages. Full-jar shard images are requested only when needed. Actual frame time depends on the device, browser, screen size and active media.

Run `npm test` and `npm run build`. Desktop-specific checks cover shared-clock suspension/cleanup, foreground reconstruction, texture budgets and generated geometry. Browser smoke checks cover the three body layers, both themes and number labels, erasing/restoration, project opening/reassembly, gallery/fullscreen video, CV pause and the mobile static-jar path.

The remaining sustained costs are visible particle gradients and multi-video project sections. Keep playback limited to the active section; increasing particle counts or adding large blurred/backdrop-filter effects should be profiled on the target PC.
