"""Export the supplied PSDs as aligned, transparent WebP layer stacks.

Requires psd-tools and Pillow. Run from the repository root:
    python scripts/export-jar-layers.py
Clipping masks, Photoshop effects and opacity are baked into alpha/color;
blend modes are retained in manifest.json for the browser compositor.
"""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.constants import BlendMode
from psd_tools.composite.blend import BLEND_FUNC

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {
    1: "print", 2: "illustration", 3: "commercial", 4: "packaging",
    5: "poster", 6: "digital", 7: "lettering",
}
BLENDS = {
    BlendMode.NORMAL: "normal", BlendMode.MULTIPLY: "multiply",
    BlendMode.LIGHTEN: "lighten", BlendMode.LUMINOSITY: "luminosity",
    BlendMode.COLOR_BURN: "color-burn",
}
GLASS_REGIONS = json.loads((ROOT / "scripts" / "jar-glass-regions.json").read_text(encoding="utf-8"))
LABEL_START = {category: "Rectangle 1" if category == "print" else "Vector Smart Object" for category in CATEGORIES.values()}


def render_layer(psd, layer, viewport):
    # Render this layer in isolation, retaining masks, styles and opacity.
    # Clipped layers need their parent alpha applied after isolated rendering.
    blend, clipping = layer.blend_mode, layer.clipping
    try:
        layer.blend_mode = BlendMode.NORMAL
        layer.clipping = False
        return psd.composite(
            viewport=viewport, layer_filter=lambda candidate: candidate is layer,
            ignore_preview=True,
        ).convert("RGBA")
    finally:
        layer.blend_mode, layer.clipping = blend, clipping


def bake_photoshop_blend(psd, layer, image, preceding, viewport):
    """Translate modes absent from CSS using the actual PSD backdrop.

    Linear burn becomes an equivalent multiply texture; darker color becomes
    a normal layer containing only the pixels Photoshop selects. Alpha and
    placement remain unchanged, including antialiased shadow edges.
    """
    backdrop = psd.composite(
        viewport=viewport, layer_filter=lambda candidate: candidate in preceding,
        ignore_preview=True,
    ).convert("RGBA")
    source = np.asarray(image).copy()
    cb = np.asarray(backdrop, dtype=np.float32)[:, :, :3] / 255
    cs = source[:, :, :3].astype(np.float32) / 255
    if layer.blend_mode == BlendMode.LINEAR_BURN:
        burnt = BLEND_FUNC[BlendMode.LINEAR_BURN](cb, cs)
        equivalent = np.divide(burnt, cb, out=np.ones_like(cb), where=cb > 0)
        source[:, :, :3] = np.round(np.clip(equivalent, 0, 1) * 255).astype(np.uint8)
        return Image.fromarray(source), "multiply"
    if layer.blend_mode == BlendMode.DARKER_COLOR:
        selected = BLEND_FUNC[BlendMode.DARKER_COLOR](cb, cs)
        unchanged = np.all(selected == cb, axis=2) & (np.asarray(backdrop)[:, :, 3] > 0)
        source[unchanged, 3] = 0
        return Image.fromarray(source), "normal"
    raise ValueError(f"Unsupported blend: {layer.name}: {layer.blend_mode}")


def export(number, category):
    source = ROOT / "temp" / f"jar-{number}.psd"
    psd = PSDImage.open(source)
    viewport = (0, 0, *psd.size)
    destination = ROOT / "public" / "assets" / category / "jar"
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"source": source.name, "width": psd.width, "height": psd.height, "layers": [], "omitted": []}
    manifest["glassPolygon"] = GLASS_REGIONS[category]
    clip_alpha = None
    index = 0
    exported = set()
    preceding = set()
    merged = set()
    foreground = False
    for layer in psd:
        if layer in merged:
            continue
        if not layer.visible or not layer.width or not layer.height:
            manifest["omitted"].append({"source": layer.name, "reason": "hidden" if not layer.visible else "empty"})
            continue
        # Editing backgrounds are not part of a transparent jar asset.
        if index == 0 and layer.kind == "solidcolorfill" and layer.bbox == viewport and not layer.clipping:
            manifest["omitted"].append({"source": layer.name, "reason": "background"})
            continue
        blend = BLENDS.get(layer.blend_mode)
        clipped = layer.clipping
        children = [child for child in layer.clip_layers if child.visible and child.width and child.height]
        # Photoshop applies parent opacity to the entire clipping stack. Keep
        # that dependency together instead of applying the opacity repeatedly.
        stack = {layer, *children} if not clipped and layer.opacity < 255 and children else {layer}
        if len(stack) > 1:
            image = psd.composite(viewport=viewport, layer_filter=lambda candidate: candidate in stack, ignore_preview=True).convert("RGBA")
            merged.update(children)
        else:
            image = render_layer(psd, layer, viewport)
        baked_blend = blend is None
        if baked_blend:
            image, blend = bake_photoshop_blend(psd, layer, image, preceding, viewport)
        alpha = image.getchannel("A")
        if clipped:
            if clip_alpha is None:
                raise ValueError(f"Missing clipping parent: {layer.name}")
            coverage = np.asarray(alpha, dtype=np.uint16) * np.asarray(clip_alpha, dtype=np.uint16)
            image.putalpha(Image.fromarray(((coverage + 127) // 255).astype(np.uint8)))
        else:
            clip_alpha = alpha
        if not image.getchannel("A").getbbox():
            manifest["omitted"].append({"source": layer.name, "reason": "transparent"})
            continue
        if layer.name == LABEL_START[category]:
            foreground = True
        filename = "base.webp" if index == 0 else f"layer_{index}.webp"
        # Transparent RGB is not displayed; dropping it makes clipped textures smaller.
        image.save(destination / filename, "WEBP", lossless=True, method=6)
        exported.add(filename)
        record = {"file": filename, "source": layer.name, "blendMode": blend, "clippingBaked": clipped}
        if index > 0:
            record["placement"] = "foreground" if foreground else "interior"
        if len(stack) > 1:
            record["sources"] = [layer.name, *[child.name for child in children]]
            record["clippingBaked"] = True
        if baked_blend:
            record["sourceBlendMode"] = layer.blend_mode.name
            record["blendBaked"] = True
        if index == 0:
            manifest["base"] = record
        else:
            manifest["layers"].append(record)
        index += 1
        preceding.update(stack)
    if not index:
        raise ValueError(f"No visible base layer: {source.name}")
    # Remove stale generated foregrounds if the updated PSD has fewer layers.
    for old_layer in destination.glob("layer_*.webp"):
        if re.fullmatch(r"layer_\d+\.webp", old_layer.name) and old_layer.name not in exported:
            old_layer.unlink()
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{source.name} -> {category}/jar: base + {index - 1} layers", flush=True)


if __name__ == "__main__":
    for number, category in CATEGORIES.items():
        export(number, category)
