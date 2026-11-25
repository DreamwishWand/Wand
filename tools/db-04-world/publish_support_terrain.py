"""Publish only decoded cell values and source digests, never original bytes.
Run against a locally synced Steam installation/original archive. The output
is the support-terrain JSON used by the existing world geometry Worker.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path

from world import parse_grid_structure
from terrain_codec import decode_window

VERSION = "1.26.2"

def build(game: Path):
    build_id = (game / "FullVersion.txt").read_text(encoding="utf-8-sig").strip()
    if "-v1.26.2-" not in build_id or "\n" in build_id:
        raise ValueError("exact Steam v1.26.2 source required")
    stream = game / "ddv_Data" / "StreamingAssets"
    source = stream / "GridData" / "Furniture"
    if not source.is_dir():
        raise ValueError("missing original Furniture GridData")
    rows, unresolved = [], []
    for p in sorted(source.rglob("*.json")):
        if p.is_symlink() or not p.is_file():
            continue
        path = p.relative_to(stream).as_posix()
        raw = p.read_bytes()
        try:
            g = parse_grid_structure(raw, source_game_version=VERSION)
            x, y = g["sizeX"], g["sizeY"]
            if not (1 <= x <= 256 and 1 <= y <= 256):
                raise ValueError("support bounds")
            if g["nativeFloorTypes"] is not None:
                a = g["nativeFloorTypes"]
                values = [a[xx*y+yy] for yy in range(y) for xx in range(x)]
            else:
                rows_y = decode_window(x, y, g["nativeFloorTypePalette"],
                    base64.b64decode(g["compactedFloorTypesBase64"], validate=True),
                    0, 0, x, y, source_game_version=VERSION)
                values = [v for row in rows_y for v in row]
            if len(values) != x*y or any(type(v) is not int or v < 0 or v > 0xffffffff for v in values):
                raise ValueError("invalid floor values")
            rows.append([path, x, y, hashlib.sha256(raw).hexdigest(), values])
        except (ValueError, KeyError, TypeError, UnicodeError) as exc:
            unresolved.append({"path": path, "reason": str(exc)[:120]})
    if not rows:
        raise ValueError("no decoded source supports")
    return {"contract":"wand.world.support-terrain@1", "platform":"Steam",
            "gameVersion":VERSION,"sourceBuild":build_id,"grids":rows}, unresolved

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    data, unresolved = build(args.game)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    if not args.out.exists() or args.out.read_text(encoding="utf-8") != encoded:
        temp = args.out.with_suffix(".tmp")
        temp.write_text(encoded, encoding="utf-8")
        temp.replace(args.out)
    print(json.dumps({"decoded": len(data["grids"]), "unresolved": unresolved}, ensure_ascii=False))
