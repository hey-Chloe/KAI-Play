#!/usr/bin/env python3
"""Build an evidence-first contact sheet for the latest KAI PLAY asset batch."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import textwrap
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/SFNS.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size)
            except OSError:
                pass
    return ImageFont.load_default()


def has_transparency(image: Image.Image) -> bool:
    if image.mode in {"RGBA", "LA"}:
        alpha = image.getchannel("A")
        return alpha.getextrema()[0] < 255
    return image.mode == "P" and "transparency" in image.info


def checker(size: tuple[int, int], cell: int = 18) -> Image.Image:
    out = Image.new("RGB", size, "#f4f1ea")
    draw = ImageDraw.Draw(out)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#d8d4cb")
    return out


def source_label(path: Path) -> str:
    parts = path.parts
    if "generated_images" in parts:
        index = parts.index("generated_images")
        return "/".join(parts[index : index + 2])
    return str(path.parent)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def svg_record(path: Path) -> tuple[int, int, bool]:
    source = path.read_text(encoding="utf-8")
    view_box = re.search(r"viewBox=[\"']([^\"']+)[\"']", source)
    if view_box:
        values = [float(value) for value in re.split(r"[ ,]+", view_box.group(1).strip())]
        if len(values) == 4:
            return round(values[2]), round(values[3]), True
    width = re.search(r"width=[\"']([\d.]+)", source)
    height = re.search(r"height=[\"']([\d.]+)", source)
    return (
        round(float(width.group(1))) if width else 0,
        round(float(height.group(1))) if height else 0,
        True,
    )


def open_preview(path: Path) -> Image.Image:
    if path.suffix.lower() != ".svg":
        with Image.open(path) as source:
            source.load()
            return source.convert("RGBA")

    with tempfile.TemporaryDirectory(prefix="kai-play-svg-") as directory:
        subprocess.run(
            ["qlmanage", "-t", "-s", "768", "-o", directory, str(path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        preview = Path(directory) / f"{path.name}.png"
        with Image.open(preview) as source:
            source.load()
            return source.convert("RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()

    paths = [Path(value).resolve() for value in args.paths]
    records: list[dict[str, object]] = []
    for path in paths:
        stat = path.stat()
        if path.suffix.lower() == ".svg":
            width, height, alpha = svg_record(path)
            mode, image_format = "vector", "SVG"
        else:
            with Image.open(path) as image:
                image.load()
                width, height = image.width, image.height
                mode, image_format = image.mode, image.format
                alpha = has_transparency(image)
        records.append(
            {
                "path": str(path),
                "filename": path.name,
                "width": width,
                "height": height,
                "mode": mode,
                "format": image_format,
                "alpha": alpha,
                "mtime": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds"),
                "mtime_epoch": stat.st_mtime,
                "source_directory": str(path.parent),
                "source_label": source_label(path),
                "bytes": stat.st_size,
                "sha256": sha256(path),
            }
        )

    records.sort(key=lambda item: (-float(item["mtime_epoch"]), str(item["path"])))
    Path(args.metadata).write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    columns = 3
    tile_w, tile_h = 480, 466
    margin, gap = 28, 18
    header_h = 116
    rows = (len(records) + columns - 1) // columns
    sheet_w = margin * 2 + columns * tile_w + (columns - 1) * gap
    sheet_h = header_h + margin + rows * tile_h + (rows - 1) * gap + margin
    sheet = Image.new("RGB", (sheet_w, sheet_h), "#ebe7df")
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 24), "KAI PLAY — FULL ASSET CONTACT SHEET", font=font(30, True), fill="#18201d")
    draw.text(
        (margin, 66),
        f"Disk snapshot · {len(records)} files · sorted by modification time · no asset generation",
        font=font(16),
        fill="#56605b",
    )

    for index, record in enumerate(records):
        col, row = index % columns, index // columns
        x = margin + col * (tile_w + gap)
        y = header_h + margin + row * (tile_h + gap)
        draw.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=18, fill="#faf8f3", outline="#cfc9be", width=2)
        preview_box = (x + 14, y + 14, x + tile_w - 14, y + 292)
        preview_size = (preview_box[2] - preview_box[0], preview_box[3] - preview_box[1])
        background = checker(preview_size) if record["alpha"] else Image.new("RGB", preview_size, "#e5e1d9")
        source = open_preview(Path(str(record["path"])))
        source.thumbnail((preview_size[0] - 12, preview_size[1] - 12), Image.Resampling.LANCZOS)
        px = (preview_size[0] - source.width) // 2
        py = (preview_size[1] - source.height) // 2
        background.paste(source, (px, py), source)
        sheet.paste(background, (preview_box[0], preview_box[1]))
        draw.rectangle(preview_box, outline="#d3cec5", width=1)

        label_x, label_y = x + 16, y + 304
        draw.text((label_x, label_y), f"{index + 1:02d}  {record['filename']}", font=font(13, True), fill="#1b2521")
        meta = f"{record['width']}×{record['height']} · {record['format']} · alpha: {'yes' if record['alpha'] else 'no'}"
        draw.text((label_x, label_y + 25), meta, font=font(12), fill="#3d4944")
        draw.text((label_x, label_y + 48), str(record["mtime"]).replace("T", " "), font=font(11), fill="#68716d")
        source_lines = textwrap.wrap(str(record["source_directory"]), width=61)[:3]
        for line_index, line in enumerate(source_lines):
            draw.text((label_x, label_y + 70 + 18 * line_index), line, font=font(11), fill="#68716d")
        draw.text((label_x, label_y + 126), f"sha256 {str(record['sha256'])[:16]}…", font=font(10), fill="#7c8581")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="PNG", optimize=True)
    print(f"wrote {output} ({sheet.width}x{sheet.height})")
    print(f"wrote {args.metadata} ({len(records)} records)")


if __name__ == "__main__":
    main()
