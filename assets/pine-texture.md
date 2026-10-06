# Pine texture iteration

The original `public/textures/pine-needles2.png` is preserved. The active texture
is `public/textures/pine-bough-soft.png` and
uses `artifacts/target.png` as a style reference, with muted forest greens,
overlapping drooping sprays, and fewer bright yellow highlights.

Intermediate generated textures are archived in `artifacts/pine-iterations/`;
only the selected soft bough is shipped alongside the original user textures.

Generated using the built-in image-generation tool with this prompt:

> Use case: style-transfer. Image 1 is the edit target: a game foliage alpha-card texture. Image 2 is ONLY a style reference for its pine trees. Output only the revised single pine branch texture, square, genuinely transparent background. Preserve the vertical central brown stem, centered bottom-to-top orientation, five pairs of tapering side sprays and narrow tip, full branch fitting inside the frame. Change the foliage to match the reference: dense overlapping drooping finger-like evergreen sprays, dark desaturated forest green and muted olive highlights, broad readable painterly shapes, subtle faceted shading. Remove vivid lime-yellow tips and tiny high-frequency triangular highlights. Make each lateral spray slope slightly downward at its outer edge, with rounded tapered needle clusters and irregular serrated silhouettes. Keep transparent gaps between tiers but increase solidity within each spray. This is a flat diffuse texture used on many overlapping 3D foliage cards, not a complete tree render. No scene, ground, baked cast shadow, glow, text, border or opaque backdrop.

The pine model embeds the texture. Rebuild its editable Blender source and GLB
with `mise run assets -- --pine-only` after changing the texture reference in
`scripts/models.py`.

The first revision (`pine-needles3.png`) improved the palette but was still
too busy in the game. The second revision simplifies the repeated shapes:

> Use case: style-transfer. Image1 edit target alpha-card texture, Image2 pine style reference only. Simplify the texture drastically for repetition on 36 overlapping pine canopy cards seen from above. Output square transparent PNG of one broad stylized evergreen bough, centered vertical brown stem from bottom center to top center. Keep dark muted forest green palette. Reduce from five dense tiers of miniature needle clusters to THREE pairs of broad solid drooping sprays plus top tip. Each side spray should contain only FOUR very large broad overlapping tapered finger-like lobes with smooth simple painted surfaces and subtly irregular outer edges. Much larger shapes, low detail, no tiny needles, no hairline ridges, no fine brush flecks, no veins, no scattered speckles, no granular texture. The base-color artwork must read as large deep evergreen masses with restrained muted sage/olive top planes; no yellow or neon. Matte simple faceted painted game art. The target pine canopy looks like big scalloped overlapping downward-pointing foliage panels. Preserve fully transparent spaces outside and between side sprays; no backdrop, shadows, text, scene, border. Single flat branch diffuse texture, not a whole tree.

## Broad canopy panels

Repeating complete sprigs still produced excessive detail. The final model uses
32 shallow hanging fans in eight whorls, an exposed tapered trunk, and a solid
canopy core with a pointed crown. The fan texture's attachment is at the top, so its UV direction is
reversed relative to the old sprig cards. UVs use the occupied vertical band
of the wide image. The core shares the same UV layer name as the cards so
joining meshes does not discard its coordinates. Canopy fill comes from the
painted texture in the existing material pass; it adds no draw calls. Tree
silhouette shadows are retained, while leaf-card intersection shadows are
disabled to preserve the broad painted planes.

The wide panel was generated with the built-in image tool using:

> Create ONE isolated evergreen BOUGH PANEL alpha-card texture, NOT a tree and NOT a cone, matching the simple broad pine foliage planes in the reference. Square transparent PNG. The actual subject is WIDE AND SHORT: width 85% of canvas, height only 40% of canvas, centered. Leave upper and lower unused areas transparent. Shape is like a downward facing hand with SEVEN very broad overlapping flat tapered fingers, ALL emerging from ONE single short central attachment at x50%,y30%, spreading left and right in ONE ROW and ending at y65% to75%. It is a rounded wide fan / shawl of foliage, not a tall triangle. One broad uninterrupted opaque mass, with ONLY the lower edge scalloped into seven broad fat long rounded tapered points. Absolutely NO internal needle lines, NO rows or tiers, NO cascading smaller leaves, NO texture grain or flecks, NO tiny sharp needles, NO tall triangle, NO trunk or branches. Diffuse hand-painted matte low-poly game foliage. Almost solid dark forest green #2b4035 with only 3 large restrained muted olive facets #455139 and dark forest shadow plane #20372f. Broad smooth painted surfaces. No shiny highlights, no neon, no yellow. This texture maps onto folded 3D bough panels in several tiers; do not depict those tiers in the texture. Actual transparent background, no ground, no scene, no text. Output just the one wide flat canopy fan.

Its last edit removes serrated detail, using the wide panel as the edit target
and `artifacts/target.png` as the style reference:

> Use case: precise-object-edit. Image1 edit target is a single wide evergreen bough alpha-card texture. Image2 style reference is the rendered pine canopy. Change ONLY the shape/detail of foliage in Image1: simplify from many jagged serrations and mini leaf triangles to SEVEN large smooth broad scalloped tapered finger lobes. Keep its same wide-short fan layout, central top attachment, overall occupied area, position in canvas, dark desaturated forest green palette, transparent background, no trunk. Each of the seven lobes must be one simple solid blade, with only 1 or 2 long subtle soft facets of shading. REMOVE all the tiny teeth, sawtooth silhouettes, triangular little facets, nested leaves, repeated smaller lobes and internal branching. Make the seven big finger lobes broad and matte, with smoothly rounded shoulders and one gently tapered tip apiece, slightly varying length. The target scene pine has chunky solid simple broad dark-green panels, not finely needled feathered sprays. No texture noise or microdetails or bright yellow. Lower contrast across internal shading, flat dark teal-forest masses and restrained muted olive highlights along the top edge. Preserve transparent surround and alpha gaps only between the seven large lobe tips. Single simple WIDE fan bough, not an entire tree or tall triangle.

Review with `mise run playtest -- --smoke --pine-review`. This saves the normal
and close game views, a whole-scene side-by-side comparison, and isolated pine
crops normalized to comparable size. These are visual review artifacts, not a
pixel-equality assertion: the target and prototype have different assets and
scene layouts.
