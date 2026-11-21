"""Offline extraction of source-backed DDV Guide definitions from native Steam itemlists.

Only field mappings established from the game-file wire layout are promoted to
relations. Additional nested wire-ID matches are explicitly candidates, never
claimed prerequisites, rewards, or active events.
"""
import argparse
import collections
import hashlib
import json
import os
import re
from pathlib import Path
import tempfile
import zipfile

from mission_semantics import extract_quest_details
from protodb_static import project_protodb
from version_diff import compare_snapshots

SCHEMA = "wand.db03.native-guide@1"
LOCALES = {"en": "en-US", "fr": "fr", "it": "it", "de": "de", "es-ES": "es",
           "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR"}
# Mapping based on observed Steam 1.26.1 itemlist members, not guessed *.json titles.
SOURCES = {"quests": "Mission", "characters": "Character", "stories": "Story",
           "worlds": "Scene", "duties": "DutyAch", "events": "RecurringEvent",
           "conditions": "Condition", "conditionalEvents": "ConditionalEvent",
           "tutorials": "Ftue"}
FIELD_KEYS = {
    "quests": {"name": 3, "availableDescription": 30,
               "startRequest": 31, "completedDescription": 42},
    "characters": {"name": 3}, "stories": {"name": 3},
    "worlds": {"name": 3}, "duties": {"description": 7},
    "events": {"name": 3}, "tutorials": {"name": 3},
}
MAX_RECORD = 8 * 1024 * 1024
MAX_SOURCE = 128 * 1024 * 1024
MAX_LOCBIN = 32 * 1024 * 1024
MAX_DEPTH = 6
SCOPE_TOKENS = re.compile(r"(?i)(?:Expansion\d{1,2}|StoryPack\d{1,2}|AdventurePack\d{1,2})")
SOFT_HYPHENS = str.maketrans("", "", "\u00ad\u200b\u200c\u200d\ufeff")


def plain_display(text):
    return re.sub(r"</?nobr>", "", text, flags=re.I).translate(SOFT_HYPHENS).strip()



def sha(data):
    return hashlib.sha256(data).hexdigest()


def stable(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".db03-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(obj, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def varint(data, pos):
    start, n = pos, 0
    for shift in range(0, 70, 7):
        if pos == len(data):
            raise ValueError("TRUNCATED_VARINT")
        b = data[pos]
        pos += 1
        if shift == 63 and b > 1:
            raise ValueError("OVERFLOW_VARINT")
        n |= (b & 127) << shift
        if b < 128:
            if data[start:pos] != encode_varint(n):
                raise ValueError("NONCANONICAL_VARINT")
            return n, pos
    raise ValueError("UNTERMINATED_VARINT")


def encode_varint(n):
    b = bytearray()
    while n > 127:
        b.append((n & 127) | 128)
        n >>= 7
    return bytes(b + bytes([n]))


def wire_fields(data):
    pos = 0
    result = []
    while pos < len(data):
        tag, pos = varint(data, pos)
        number, wire = tag >> 3, tag & 7
        if not number or wire not in (0, 1, 2, 5):
            raise ValueError("INVALID_WIRE_FIELD")
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if size > len(data) - pos:
                raise ValueError("TRUNCATED_FIXED")
            value, pos = data[pos:pos+size], pos+size
        else:
            size, pos = varint(data, pos)
            if size > len(data)-pos:
                raise ValueError("TRUNCATED_LENGTH")
            value, pos = data[pos:pos+size], pos+size
        result.append((number, wire, value))
    return result


def canonical_wire(fields):
    """Byte-faithful protobuf-wire reconstruction of validated source fields.

    Used for per-definition diff fingerprints even before field semantics are mapped.
    """
    result = bytearray()
    for number, wire, value in fields:
        result.extend(encode_varint((number << 3) | wire))
        if wire == 0:
            result.extend(encode_varint(value))
        elif wire == 2:
            result.extend(encode_varint(len(value)))
            result.extend(value)
        else:
            result.extend(value)
    return bytes(result)


def native_frames(data):
    pos, index, frame_base, used = 0, 0, None, set()
    while pos < len(data):
        offset, pos = varint(data, pos)
        size, pos = varint(data, pos)
        if not size or size > MAX_RECORD or size > len(data) - pos or offset in used:
            raise ValueError("INVALID_NATIVE_FRAME")
        used.add(offset)
        fields = wire_fields(data[pos:pos+size])
        ids = [v for n, w, v in fields if n == 1 and w == 0]
        if len(ids) != 1 or not isinstance(ids[0], int) or ids[0] <= 0:
            raise ValueError("MISSING_OR_DUPLICATE_NATIVE_ID")
        base = ids[0] - offset
        if frame_base is None:
            frame_base = base
        if base != frame_base:
            raise ValueError("NATIVE_ID_FRAME_KEY_MISMATCH")
        yield index, offset, ids[0], fields
        pos += size
        index += 1


def text_field(fields, number):
    vals = [v for n, w, v in fields if n == number and w == 2]
    if len(vals) != 1:
        return None
    try:
        text = vals[0].decode("utf-8")
    except UnicodeDecodeError:
        return None
    return text if text and not any(ord(c) < 32 for c in text) else None


def int_field(fields, number):
    vals = [v for n, w, v in fields if n == number and w == 0]
    return vals[0] if len(vals) == 1 else None


def nested_strings(data, depth=0, prefix=""):
    """Wire-valid UTF-8 localization-key paths, without interpreting game logic."""
    if depth >= MAX_DEPTH or not data:
        return []
    try:
        fields = wire_fields(data)
    except ValueError:
        return []
    values = []
    for index, (number, wire, value) in enumerate(fields):
        if wire != 2:
            continue
        path = f"{prefix}/{number}[{index}]"
        try:
            val = value.decode("utf-8")
            if "." in val and "_" in val and len(val) < 400 and not any(ord(c) < 32 for c in val):
                values.append((path, val))
        except UnicodeDecodeError:
            pass
        values.extend(nested_strings(value, depth + 1, path))
    return values


def nested_ids(data, ids, depth=0, prefix="", max_matches=128):
    if depth >= MAX_DEPTH or not data:
        return []
    try:
        fields = wire_fields(data)
    except ValueError:
        return []
    matches = []
    for index, (number, wire, value) in enumerate(fields):
        path = f"{prefix}/{number}[{index}]"
        if wire == 0 and value in ids:
            matches.append((path, value))
        elif wire == 2:
            matches.extend(nested_ids(value, ids, depth + 1, path, max_matches))
        if len(matches) >= max_matches:
            break
    return matches[:max_matches]


def locbin_decode(data):
    if len(data) > MAX_LOCBIN:
        raise ValueError("LOCBIN_OVERSIZED")
    result = {}
    for number, wire, value in wire_fields(data):
        if number != 1 or wire != 2:
            raise ValueError("INVALID_LOCBIN_CONTAINER")
        parts = wire_fields(value)
        if len(parts) != 2 or [(n, w) for n, w, _ in parts] != [(1, 2), (2, 2)]:
            raise ValueError("INVALID_LOCBIN_ENTRY")
        key, val = [v.decode("utf-8") for _, _, v in parts]
        if not key or key in result or len(key) > 1024 or len(val) > 32768:
            raise ValueError("INVALID_OR_DUPLICATE_LOCBIN_KEY")
        result[key] = val
    return result


class LocaleResolver:
    def __init__(self, folder):
        self.archives = {}
        self.cache = {}
        self.missing = []
        self.provenance = {}
        for locale, suffix in LOCALES.items():
            path = folder / f"LocDB_{suffix}.zip"
            if path.is_file() and not path.is_symlink():
                self.archives[locale] = zipfile.ZipFile(path)
                self.provenance[locale] = {"file": path.name, "sha256": sha(path.read_bytes())}
            else:
                self.missing.append({"kind": "missing_locale_archive", "locale": locale})

    def close(self):
        for archive in self.archives.values():
            archive.close()

    def resolve(self, key):
        if not key or "." not in key:
            return {}, None
        member, token = key.rsplit(".", 1)
        member += ".locbin"
        if not token:
            return {}, None
        values = {}
        for locale, archive in self.archives.items():
            cache_key = (locale, member)
            if cache_key not in self.cache:
                if member not in archive.NameToInfo:
                    self.cache[cache_key] = None
                else:
                    info = archive.getinfo(member)
                    if info.file_size > MAX_LOCBIN:
                        raise ValueError("LOCBIN_MEMBER_OVERSIZED: " + member)
                    self.cache[cache_key] = locbin_decode(archive.read(info))
            table = self.cache[cache_key]
            if table is not None and token in table:
                values[locale] = table[token]
        return values, member


def source_root(game):
    sub = game / "ddv_Data" / "StreamingAssets"
    return sub if sub.is_dir() else game


def source_data(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_SOURCE:
        raise ValueError("MISSING_OR_OVERSIZED_SOURCE: " + path.name)
    return path.read_bytes()


def load_items(path):
    ids = set()
    if path is None:
        return ids
    with path.open("r", encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            row = json.loads(line)
            item = row.get("itemId")
            if type(item) is not int or item <= 0 or item in ids:
                raise ValueError("INVALID_ITEM_INDEX")
            ids.add(item)
    return ids


def as_record(family, native, frame, index, file_hash):
    fields = frame
    raw = text_field(fields, 2)
    if raw is None:
        raise ValueError("INVALID_NATIVE_NAME_FIELD")
    rec = {"id": str(native), "rawName": raw, "nameKey": None,
           "nativeWireSha256": sha(canonical_wire(fields)),
           "names": {}, "textKeys": {}, "localizedText": {}, "plainText": {},
           "sourceScopeTokens": sorted(set(SCOPE_TOKENS.findall(raw)), key=str.casefold),
           "source": {"file": f"ddv_Data/StreamingAssets/itemlist/{SOURCES[family]}.json",
                      "sha256": file_hash, "frameIndex": index}}
    for purpose, field in FIELD_KEYS.get(family, {}).items():
        key = text_field(fields, field)
        if key:
            rec["textKeys"][purpose] = key
            if purpose == "name":
                rec["nameKey"] = key
    return rec


def add_verified(rels, family, record, target_family, target_id, path, indexes):
    if target_id is None:
        return
    rec = {"fromFamily": family, "fromId": record["id"], "toFamily": target_family,
           "toId": str(target_id), "sourceField": path,
           "status": "resolved" if str(target_id) in indexes.get(target_family, set()) else "unresolved"}
    rels.append(rec)


def read_friendship_rewards(origin):
    """Import only the game's DEFAULT friendship-level reward table, if present."""
    path = origin / "friendship_levels_default.json"
    if not path.is_file():
        return [], None
    data = source_data(path)
    source_hash = sha(data)
    parsed = json.loads(data.decode("utf-8-sig"))
    if not isinstance(parsed, list):
        raise ValueError("INVALID_FRIENDSHIP_REWARD_TABLE")
    rewards, seen_levels = [], set()
    for row in parsed:
        level, xp = row.get("Level"), row.get("XP")
        if type(level) is not int or level in seen_levels or type(xp) is not int or xp < 0:
            raise ValueError("INVALID_FRIENDSHIP_REWARD_LEVEL")
        seen_levels.add(level)
        for stage in ("FirstIntermediateReward", "SecondIntermediateReward",
                      "ThirdIntermediateReward", "CompletedReward"):
            for index, award in enumerate(row.get(stage, [])):
                if not isinstance(award, dict) or type(award.get("ID")) is not int or \
                        type(award.get("Amount")) is not int:
                    raise ValueError("INVALID_FRIENDSHIP_REWARD_ENTRY")
                rewards.append({"id": f"default:{level}:{stage}:{index}",
                                "level": level, "xp": xp, "rewardStage": stage,
                                "nativeRewardId": str(award["ID"]),
                                "amount": award["Amount"],
                                "scope": "default_friendship_level_not_character_specific",
                                "source": {"file": "ddv_Data/StreamingAssets/friendship_levels_default.json",
                                           "sha256": source_hash}})
    return rewards, {"file": "friendship_levels_default.json", "sha256": source_hash,
                     "bytes": len(data), "records": len(rewards)}


def structured_condition_overlays(origin, rows, indexes, relations, unresolved):
    """Attach actual source JSON predicates; never guess them from protobuf numbers."""
    summary = {"conditions": 0, "conditionalEvents": 0}
    for fam, folder in (("conditions", "Condition"), ("conditionalEvents", "ConditionalEvent")):
        by_id = {r["id"]: r for r in rows[fam]}
        directory = origin / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.json")):
            data = source_data(path)
            payload = json.loads(data.decode("utf-8-sig"))
            if not isinstance(payload, dict) or type(payload.get("ID")) is not int:
                unresolved.append({"kind": "malformed_structured_definition", "file": path.name})
                continue
            id_ = str(payload["ID"])
            native = by_id.get(id_)
            if native is None:
                unresolved.append({"kind": "unmatched_structured_definition", "file": path.name,
                                   "id": id_, "family": fam})
                continue
            if payload.get("Name") != native["rawName"]:
                unresolved.append({"kind": "structured_name_mismatch", "file": path.name,
                                   "id": id_, "family": fam})
                continue
            native["structuredDefinition"] = payload
            native["structuredSource"] = {"file": f"ddv_Data/StreamingAssets/{folder}/{path.name}",
                                           "sha256": sha(data)}
            summary[fam] += 1
            # Extract only a named, schema-observed MissionStepStatus condition.
            def walk(value, loc="$", depth=0):
                if depth > 20:
                    return
                if isinstance(value, dict):
                    status = value.get("MissionStepStatus")
                    if isinstance(status, dict) and type(status.get("Mission")) is int:
                        add_verified(relations, fam, native, "quests", status["Mission"],
                                     loc + ".MissionStepStatus.Mission", indexes)
                    for k, v in value.items():
                        walk(v, loc + "." + k, depth + 1)
                elif isinstance(value, list):
                    for i, v in enumerate(value):
                        walk(v, loc + f"[{i}]", depth + 1)
            walk(payload)
    return summary

def extract(game, out, version, platform, item_index=None, previous=None):
    game, out = game.resolve(), out.resolve()
    if not version.strip() or not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("INVALID_VERSION_OR_PATHS")
    origin = source_root(game)
    files, missing, hashes = {}, [], {}
    for fam, stem in SOURCES.items():
        file = origin / "itemlist" / (stem + ".json")
        if not file.is_file():
            missing.append({"kind": "missing_native_source", "family": fam, "path": str(file)})
            continue
        data = source_data(file)
        files[fam], hashes[fam] = data, sha(data)
    locale = LocaleResolver(origin / "Localization")
    ids = load_items(item_index)
    rows, frames_by_family = {}, {}
    try:
        for fam, data in files.items():
            frames = list(native_frames(data))
            if not frames:
                missing.append({"kind": "empty_native_source", "family": fam})
                continue
            frames_by_family[fam] = frames
            rows[fam] = [as_record(fam, id_, fields, idx, hashes[fam]) for idx, key, id_, fields in frames]
        for fam in SOURCES:
            rows.setdefault(fam, [])
        indexes = {fam: {rec["id"] for rec in records} for fam, records in rows.items()}
        indexes["items"] = {str(x) for x in ids}
        for fam, records in rows.items():
            if len(indexes[fam]) != len(records):
                raise ValueError("DUPLICATE_NATIVE_ID_IN_FAMILY: " + fam)
        # Both MissionItemData and MissionQuestItemData live in Mission.json.
        # Only source-discriminating fields justify classification. Others are
        # explicitly unclassified, not silently added as playable quests.
        group_targets = {str(int_field(f, 13)) for _, _, _, f in
                         frames_by_family.get("quests", []) if int_field(f, 13) is not None}
        kinds = []
        for _i, _offset, native_id, fields in frames_by_family.get("quests", []):
            present = {num for num, wire, value in fields}
            if present.intersection((7, 40, 13)):
                kind, basis = "mission", "MissionItemData.owner/steps/questId"
            elif 6 in present or str(native_id) in group_targets:
                kind, basis = "questGroup", "MissionQuestItemData.villageScene or referenced questId"
            else:
                kind, basis = "unclassified", "no discriminating field"
            kinds.append({"id": str(native_id), "recordKind": kind, "evidence": basis})
        kind_by_id = {r["id"]: r["recordKind"] for r in kinds}
        for rec in rows["quests"]:
            rec["recordKind"] = kind_by_id[rec["id"]]
        relations, candidates, unresolved = [], [], list(missing)
        translation_missing = []
        known = {int(k): target for target, index in indexes.items() for k in index
                 if k.isdigit() and (target == "items" or target in ("quests", "characters", "worlds", "stories"))}
        localized_step_keys = 0
        for fam, records in rows.items():
            fr_by_id = {str(id_): fields for _, _, id_, fields in frames_by_family.get(fam, [])}
            for rec in records:
                fields = fr_by_id[rec["id"]]
                for purpose, key in rec["textKeys"].items():
                    values, member = locale.resolve(key)
                    if values:
                        rec["localizedText"][purpose] = values
                        rec["plainText"][purpose] = {loc: plain_display(val) for loc, val in values.items()}
                        if purpose == "name":
                            rec["names"] = rec["plainText"][purpose]
                    for loc in LOCALES:
                        if loc not in values:
                            translation_missing.append({"family": fam, "id": rec["id"],
                                                        "field": purpose, "locale": loc, "key": key})
                if fam == "quests":
                    char_id = int_field(fields, 7)
                    category_id = int_field(fields, 13)
                    if char_id is not None:
                        add_verified(relations, fam, rec, "characters", char_id, "protobuf.7", indexes)
                    if category_id is not None:
                        add_verified(relations, fam, rec, "quests", category_id, "protobuf.13:group", indexes)
                    steps = []
                    for num, wire, value in fields:
                        if (num, wire) != (40, 2):
                            continue
                        keys = sorted(set(k for _, k in nested_strings(value)))
                        translations = {}
                        for key in keys:
                            values, member = locale.resolve(key)
                            if values:
                                translations[key] = values
                                localized_step_keys += 1
                            for loc in LOCALES:
                                if loc not in values:
                                    translation_missing.append({"family": fam, "id": rec["id"], "step": len(steps),
                                                                "locale": loc, "key": key})
                        steps.append({"index": len(steps), "nativeWireSha256": sha(value),
                                      "localizationKeys": keys,
                                      "localizedText": translations})
                    rec["steps"] = steps
                    rec["nativeStepCount"] = len(steps)
                    rec["groupId"] = str(category_id) if category_id is not None else None
                    rec["characterId"] = str(char_id) if char_id is not None else None
                    rec["typeCode"] = int_field(fields, 8)
                    # Typed, audited IL2CPP contracts: condition AST and nested
                    # step/sub-step/objective definitions. Unknown payloads stay
                    # opaque with SHA-256 fingerprints, never guessed.
                    typed = extract_quest_details(fields, rec["id"],
                        (wire_fields, text_field, int_field, sha, plain_display),
                        locale, translation_missing)
                    typed_links = typed.pop("typedRelations")
                    rec["structured"] = typed
                    for edge in typed_links:
                        add_verified(relations, fam, rec, edge["toFamily"],
                                     edge["toId"], edge["sourceField"], indexes)
                        relations[-1]["predicate"] = edge["predicate"]
                        relations[-1]["relationKind"] = edge.get(
                            "relationKind", "static_condition_reference")
                elif fam == "characters":
                    rec["storyCodeUnverified"] = str(int_field(fields, 13)) if int_field(fields, 13) is not None else None
                    rec["sceneId"] = str(int_field(fields, 14)) if int_field(fields, 14) is not None else None
                    add_verified(relations, fam, rec, "worlds", int_field(fields, 14), "protobuf.14", indexes)
                # Non-semantic, source-traceable matches only: not asserted as rewards or prerequisites.
                if fam in ("quests", "duties", "events", "conditionalEvents", "conditions"):
                    seen = set()
                    for number, wire, value in fields:
                        if wire != 2 or number in (2, 3, 4, 7, 30, 31, 32, 42):
                            continue
                        for path, id_ in nested_ids(value, known, prefix=str(number)):
                            key = (path, id_)
                            if key in seen:
                                continue
                            seen.add(key)
                            candidates.append({"fromFamily": fam, "fromId": rec["id"],
                                               "toFamily": known[id_], "toId": str(id_),
                                               "wirePath": path, "status": "candidate_not_semantically_verified"})
        # Native selector projection for DB-01 cross-references. Weighted
        # alternatives are NOT independent required items, and the optional
        # SRC-01 index may not cover all item kinds or match this source build.
        item_objective_links = []
        for quest in rows['quests']:
            if quest.get('recordKind') != 'mission':
                continue
            for step in quest.get('structured', {}).get('stepsDetailed', []):
                for sub in step['subSteps']:
                    for obj in sub['objectives']:
                        item_targets = obj.get('itemTargets')
                        if item_targets is None:
                            continue
                        for selector in item_targets['selectors']:
                            for reference in selector['itemCandidates']:
                                item_id = reference['id']
                                inner = selector.get('nested', selector)
                                item_objective_links.append({
                                    'questId': quest['id'], 'stepId': step['stepId'],
                                    'subStepId': sub['subStepId'],
                                    'objectiveId': obj['objectiveId'],
                                    'objectiveKind': obj['type'],
                                    'selectorRole': selector['role'],
                                    'selectorMode': inner.get('mode', 'unresolved'),
                                    'candidateRole': reference['role'],
                                    'generatorKind': reference['generatorKind'],
                                    'itemId': item_id,
                                    'amountDefinition': item_targets.get('amount'),
                                    'indexMembership': ('present' if item_id in indexes['items']
                                        else 'not_in_supplied_index') if item_index else 'unchecked',
                                    'sourceField': ('protobuf.40[' + str(step['index']) + '].20['
                                        + str(sub['index']) + '].50[' + str(obj['index']) + ']'),
                                    'sourceObjectiveSha256': obj['nativeWireSha256']})
        overlay_counts = structured_condition_overlays(origin, rows, indexes, relations, unresolved)
        reward_rows, reward_source = read_friendship_rewards(origin)
        relations.sort(key=lambda x: (x["fromFamily"], x["fromId"], x["toFamily"], x["toId"], x["sourceField"]))
        candidates.sort(key=lambda x: (x["fromFamily"], x["fromId"], x["toFamily"], x["toId"], x["wirePath"]))
        unresolved.extend(r for r in relations if r["status"] == "unresolved")
        target = {"platform": platform, "gameVersion": version}
        for fam in SOURCES:
            save(out / "guide" / (fam + ".json"),
                 {"schema": SCHEMA, "family": fam, "target": target,
                  "records": sorted(rows[fam], key=lambda x: int(x["id"]))})
        save(out / "guide" / "rewards.json", {"schema": SCHEMA, "family": "rewards",
                 "target": target, "records": reward_rows,
                 "scope": "default_friendship_levels_only"})
        save(out / "database" / "mission-record-kinds.json", {
                  "schema": SCHEMA, "target": target, "records": kinds,
                  "note": "Groups and ambiguous definitions must not appear as playable quests."})
        save(out / 'database' / 'item-objective-links.json', {
                  'schema': 'wand.db03.item-objective-links@1', 'target': target,
                  'indexCoverage': 'optional_partial_SRC01_membership_only_not_version_verification',
                  'meaning': 'Selector candidates, NOT all simultaneously required items',
                  'links': item_objective_links})
        save(out / "database" / "relations.json", {"schema": SCHEMA, "relations": relations,
                                                      "target": target})
        save(out / "database" / "candidate-refs.json", {"schema": SCHEMA,
                "note": "Wire-value matches are NOT verified prerequisites, rewards, or quest steps.",
                "candidates": candidates})
        save(out / "unresolved.json", {"issues": unresolved,
                  "missingLocalization": translation_missing,
                  "unverifiedSemantics": ["Star Path liveops definitions and rewards",
                      "Mission step objective predicates", "Mission prerequisites and reward payloads",
                      "Event availability, server state and schedule", "Expansion/adventure-pack entitlement flags"]})
        missing_families = sorted(set(SOURCES) - set(files))
        status = "NEEDS_SOURCE_MAPPING" if not rows["quests"] else "PARTIAL"
        source_info = {fam: {"file": f"itemlist/{SOURCES[fam]}.json", "sha256": hashes[fam],
                             "bytes": len(files[fam]), "records": len(rows[fam])} for fam in files}
        protodb_summary = project_protodb(origin, out, target, locale, wire_fields,
            text_field, int_field, sha, source_data, save, plain_display,
            indexes.get("quests"))
        manifest = {"schema": SCHEMA, "target": target, "status": status,
                    "sources": source_info, "localizationSources": locale.provenance,
                    "friendshipRewardSource": reward_source, "structuredDefinitions": overlay_counts,
                    "itemIndexSha256": sha(item_index.read_bytes()) if item_index else None,
                    "counts": {**{fam: len(rows[fam]) for fam in SOURCES}, "rewards": len(reward_rows)},
                    "missingSources": missing_families,
                    "protoDbStatic": protodb_summary,
                    "missionRecordKinds": dict(collections.Counter(r["recordKind"] for r in kinds)),
                    "decodedObjectiveCount": sum(len(sub["objectives"])
                        for r in rows["quests"] for step in r.get("structured", {}).get("stepsDetailed", [])
                        for sub in step["subSteps"]),
                    "decodedObjectiveTypeCount": len({obj["type"]
                        for r in rows["quests"] for step in r.get("structured", {}).get("stepsDetailed", [])
                        for sub in step["subSteps"] for obj in sub["objectives"]}),
                    "itemObjectiveSelectorLinks": len(item_objective_links),
                    "itemObjectiveUniqueCandidateIds": len({x['itemId'] for x in item_objective_links}),
                    "sourceFieldRelations": len(relations),
                    "unresolvedRelations": sum(r["status"] == "unresolved" for r in relations),
                    "candidateWireMatches": len(candidates),
                    "missingLocalizedFields": len(translation_missing),
                    "notes": ["Only native static definitions; no live event status inferred.",
                              "ID and name-key mapping validated by native frames and exact locbin lookup.",
                              "Candidate wire matches are not verified reward or prerequisite edges.",
                              "Native wire SHA-256 fingerprints detect changes in opaque fields without inventing their semantics.",
                               "Nested objective types and conditions are mapped from Steam 1.26.1 IL2CPP definitions; conditions are not evaluated.",
                              "Star Path definitions require additional source validation."]}
        save(out / "manifest.json", manifest)
        save(out / "report.json", {"schema": SCHEMA, "status": status,
                                   "counts": manifest["counts"],
                                   "localizedNameRows": {fam: sum(bool(r["names"]) for r in rr) for fam, rr in rows.items()},
                                   "relations": len(relations), "candidateRefs": len(candidates),
                                   "missingLocales": len(translation_missing),
                                   "localizedStepKeys": localized_step_keys})
        if previous:
            save(out / "diff.json", {"previous": str(previous),
                                    **compare_snapshots(previous, out, manifest)})
        else:
            save(out / "diff.json", {"schema": SCHEMA, "status": "BASELINE_NO_PREVIOUS",
                                    "previous": None, "target": target,
                                    "note": "No earlier source snapshot supplied; no change claim is made."})
        print(stable({"status": status, "counts": manifest["counts"],
                      "relations": len(relations), "candidateRefs": len(candidates),
                      "output": str(out)}))
    finally:
        locale.close()


def main():
    parser = argparse.ArgumentParser(description="DDV native protobuf Guide extractor, offline")
    parser.add_argument("--input", required=True, type=Path,
                        help="Steam game root or ddv_Data/StreamingAssets directory")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--platform", default="Steam")
    parser.add_argument("--item-index", type=Path, help="SRC-01 items.jsonl")
    parser.add_argument("--previous", type=Path, help="Previous DB-03 extract directory")
    args = parser.parse_args()
    try:
        extract(args.input, args.output, args.version, args.platform,
                args.item_index, args.previous)
    except (OSError, ValueError, UnicodeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"DB-03 error: {error}\n")


if __name__ == "__main__":
    main()
