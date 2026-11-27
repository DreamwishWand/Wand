"""Private source census for photo-mode previews; reuses DB-01 and SRC-04 readers."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS / "db-01-items"))
sys.path.insert(0, str(TOOLS / "src-04-r2"))
from build_full_native_fields import frames, fields
from resolve_shop_catalog import resolve

ROLES = {7: "female", 8: "male", 9: "femaleGown", 10: "maleGown", 12: "accessory"}
CLASSES = {"female": "AnimationClip", "male": "AnimationClip",
           "femaleGown": "AnimationClip", "maleGown": "AnimationClip",
           "accessory": "GameObject", "companionPrefab": "GameObject"}
GUID = re.compile(r"guid:([0-9a-f]{32})")
FIELD_NAMES = {1: "ID", 2: "Name", 6: "AvatarForm", 7: "FemaleClipAddress",
               8: "MaleClipAddress", 9: "FemaleGownClipAddress",
               10: "MaleGownClipAddress", 12: "AccessoryPrefabAddress"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def class_body(dump, name):
    matches = list(re.finditer(
        r"^public (?:sealed )?class " + re.escape(name) + r"(?=[: \n])[^\n]*\n\{\n(.*?)^\}",
        dump, re.M | re.S))
    # Nested helper class names must not be mistaken for the exact class.
    if len(matches) != 1:
        raise ValueError("missing or ambiguous class: " + name)
    return matches[0][1]

def check_declarations(dump):
    body = class_body(dump, "AvatarEmotePoseItemData")
    found = {int(n): name for name, n in re.findall(r"public const int (\w+)FieldNumber = (\d+);", body)}
    if any(found.get(n) != name for n, name in FIELD_NAMES.items()):
        raise ValueError("AvatarEmotePoseItemData field layout changed")
    pet = class_body(dump, "PetItemData")
    if "public const int PrefabAddressFieldNumber = 5;" not in pet:
        raise ValueError("PetItemData prefab field changed")
    return class_body(dump, "PetPhotoPose")

def scalar(raw, wanted):
    values = {}
    for n, w, v, _ in fields(raw):
        if n not in wanted:
            continue
        if n in values or w != wanted[n]:
            raise ValueError("duplicate or invalid scalar field")
        values[n] = v
    return values

def identity(raw):
    f = scalar(raw, {1: 0, 2: 2})
    if 1 not in f or 2 not in f or not 0 < f[1] < 2**53:
        raise ValueError("invalid item identity")
    return f[1], f[2].decode("utf-8")

def address(value):
    if value is None:
        return None
    return value.decode("utf-8")

def collect(avatar, companion):
    emotes, companions, refs = [], [], defaultdict(set)
    seen = set()
    def register(row, role, value):
        if value is None:
            return
        m = GUID.fullmatch(value)
        row["references"][role] = {"address": value, "guid": m[1] if m else None}
        if m:
            refs[m[1]].add(CLASSES[role])
    for _, raw in frames(avatar):
        i, name = identity(raw)
        if i in seen or i // 10_000_000 != 7:
            raise ValueError("invalid AvatarFeature identity")
        seen.add(i)
        if i // 100_000 % 100 != 2:
            continue
        f = scalar(raw, {6: 0, **{n: 2 for n in ROLES}})
        row = {"itemId": i, "nativeName": name, "avatarFormWire": f.get(6, 0), "references": {}}
        for n, role in ROLES.items():
            register(row, role, address(f.get(n)))
        emotes.append(row)
    for _, raw in frames(companion):
        i, name = identity(raw)
        if i in seen or i // 10_000_000 != 12:
            raise ValueError("invalid Companion identity")
        seen.add(i)
        f = scalar(raw, {5: 2})
        row = {"itemId": i, "nativeName": name, "subtypeCode": i // 100_000 % 100,
               "references": {}, "photoPoseVerified": False}
        register(row, "companionPrefab", address(f.get(5)))
        companions.append(row)
    if not emotes or not companions:
        raise ValueError("empty source census")
    return emotes, companions, refs

def build(itemlist, dump_path, catalog, game_version):
    avatar = (itemlist / "AvatarFeature.json").read_bytes()
    companion = (itemlist / "Companion.json").read_bytes()
    dump = dump_path.read_bytes()
    pet_body = check_declarations(dump.decode("utf-8-sig"))
    emotes, companions, refs = collect(avatar, companion)
    locs, pins = resolve(catalog, refs, resource_classes=("UnityEngine.AnimationClip", "UnityEngine.GameObject"))
    for guid, candidates in locs.items():
        locs[guid] = [v for v in candidates if v["class"] in refs[guid]]
    for row in emotes + companions:
        for role, ref in row["references"].items():
            candidates = [v for v in locs.get(ref["guid"], []) if v["class"] == CLASSES[role]]
            ref["catalogStatus"] = "unique" if len(candidates) == 1 else "missing" if not candidates else "ambiguous"
    enum_names = ("PhotoModePoseSelfie", "PhotoModePoseStanding", "PhotoModeExpression", "AvatarForm")
    enum_rows = {}
    text = dump.decode("utf-8-sig")
    for name in enum_names:
        m = re.search(r"^public enum " + name + r"[^\n]*\n\{\n(.*?)^\}", text, re.M | re.S)
        if m:
            enum_rows[name] = {k: int(v, 0) for k, v in re.findall(
                r"public const " + name + r" (\w+) = (-?(?:0x[0-9a-fA-F]+|\d+));", m[1])}
    report = {"schema": "wand.photo-mode.private-source-census@1", "privateOnly": True,
              "publicationAuthorized": False, "gameVersion": game_version,
              "sourceSha256": {"AvatarFeature.json": sha(avatar), "Companion.json": sha(companion),
                               "dump.cs": sha(dump), **pins},
              "emotes": emotes, "companionDefinitions": companions, "locations": locs,
              "runtimeEnums": enum_rows,
              "petPhotoPoseFields": [line.strip().split("//", 1)[0].strip()
                                    for line in pet_body.splitlines()
                                    if "// 0x" in line and re.search(r"attachment|PhotoPose|AvatarAnimationClip", line, re.I)],
              "coverage": {"emoteDefinitions": len(emotes), "companionDefinitions": len(companions),
                           "companionSubtypes": dict(Counter(x["subtypeCode"] for x in companions)),
                           "uniqueAnimationGuids": sum("AnimationClip" in v for v in refs.values()),
                           "uniqueAccessoryGuids": len({x["references"]["accessory"]["guid"] for x in emotes
                                                       if "accessory" in x["references"] and x["references"]["accessory"]["guid"]}),
                           "uniqueCatalogLocations": sum(len(v) == 1 for v in locs.values()),
                           "serializedObjectsVerified": 0, "companionPhotoPosesVerified": 0}}
    return report

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--itemlist", type=Path, required=True)
    p.add_argument("--dump", type=Path, required=True)
    p.add_argument("--catalog", type=Path, required=True)
    p.add_argument("--game-version", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--objects", action="store_true", help="resolve exact Unity readers using local bundles (requires UnityPy)")
    a = p.parse_args()
    out = a.out.resolve()
    if any((x / ".git").exists() for x in out.parents):
        raise ValueError("private output must stay outside Git")
    if out.exists():
        raise FileExistsError(out)
    report = build(a.itemlist, a.dump, a.catalog, a.game_version)
    if a.objects:
        from resolve_shop_objects import resolve_objects
        hits, _, missing, diagnostics, unsupported = resolve_objects(a.catalog.resolve(), report["locations"])
        report["serializedObjects"] = {g: list(v.values()) for g, v in hits.items()}
        report["missingBundles"] = missing
        report["objectDiagnostics"] = diagnostics
        report["unsupportedLocations"] = unsupported
        report["coverage"]["serializedObjectsVerified"] = sum(len(v) == 1 for v in hits.values())
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("x", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report["coverage"], indent=2))

if __name__ == "__main__":
    main()
