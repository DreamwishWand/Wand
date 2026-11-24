"""Private, incremental ItemID source inventory from verified SRC-00 scans.

Reuses unchanged source files without decoding; compares exact frame payloads for
changed files, retains history even for absent definitions, and never equates
source presence with player availability or DLC membership. No network or upload.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from build_complete_source_master import frames, scalar

SCHEMA = "wand.db01.native-history@1"
PREFIX = "ddv_Data/StreamingAssets/itemlist/"
SHA = re.compile(r"[a-f0-9]{64}\Z")
VERSION = re.compile(r"\d+\.\d+\.\d+\Z")
CATEGORY = re.compile(r"[A-Za-z][A-Za-z0-9]*\.json\Z")

def check(ok, code):
    if not ok:
        raise ValueError("DB01_NATIVE_HISTORY_" + code)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def pinned_json(path, expected):
    raw = Path(path).read_bytes()
    check(SHA.fullmatch(expected or "") and digest(raw) == expected, "PIN_MISMATCH")
    return json.loads(raw)

def parse_scan(root, scan, expected):
    doc = pinned_json(scan, expected)
    version = doc.get("game_version", {}).get("value")
    check(doc.get("schema_version") == 1 and doc.get("status") == "complete"
          and not doc.get("errors") and doc.get("platform", {}).get("value") == "steam"
          and doc.get("game_version", {}).get("status") == "verified_from_file"
          and isinstance(version, str) and VERSION.fullmatch(version), "SCAN")
    records = {}
    for row in doc["files"]:
        path = row["path"]
        check(path not in records, "DUPLICATE_PATH")
        records[path] = row
    version_bytes = (root / "FullVersion.txt").read_bytes()
    check(digest(version_bytes) == records.get("FullVersion.txt", {}).get("sha256")
          and re.search(rb"-v" + version.encode().replace(b".", rb"\.") + rb"-", version_bytes),
          "VERSION_SOURCE")
    sources = {}
    for path, row in records.items():
        if not path.startswith(PREFIX):
            continue
        filename = path[len(PREFIX):]
        check(CATEGORY.fullmatch(filename) and SHA.fullmatch(row["sha256"])
              and type(row["size"]) is int and row["size"] >= 0, "SOURCE_ENTRY")
        sources[filename[:-5]] = row
    check(len(sources) >= 39 and {"ActivityItem", "Furniture", "Clothing", "Condition",
          "Mission", "ItemCondition"}.issubset(sources), "INCOMPLETE_ITEMLIST")
    actual = {p.name[:-5] for p in (root / PREFIX).glob("*.json")}
    check(actual == set(sources), "SOURCE_CENSUS")
    return version, digest(version_bytes), sources

def decode(raw, category):
    rows = []
    seen = set()
    for offset, length, wire in frames(raw):
        item_id = scalar(wire, 1, 0)
        key = scalar(wire, 2, 2)
        check(type(item_id) is int and 0 < item_id < 2**53 and item_id not in seen
              and isinstance(key, bytes) and key, "FRAME_IDENTITY")
        seen.add(item_id)
        rows.append([item_id, key.decode("utf8"), digest(raw[offset:offset+length]), offset, length])
    return rows

def update(root, scan, scan_sha, previous=None, previous_sha=None, content_release=None):
    root = Path(root).resolve(strict=True)
    version, version_sha, sources = parse_scan(root, scan, scan_sha)
    old = pinned_json(previous, previous_sha) if previous else None
    if old:
        check(old.get("schema") == SCHEMA and old.get("platform") == "Steam"
              and old.get("complete") is True and VERSION.fullmatch(old["gameVersion"]),
              "PREVIOUS_LEDGER")
        check(tuple(map(int,version.split("."))) >= tuple(map(int,old["gameVersion"].split("."))),
              "VERSION_REGRESSION")
        check(set(old["sources"]).issubset(sources), "SOURCE_COVERAGE_LOST")
    prior_files = old["sources"] if old else {}
    prior_active = {r[0]: (cat,r) for cat, entry in prior_files.items() for r in entry["frames"]}
    history = {int(k):dict(v) for k,v in (old["history"].items() if old else [])}
    current, active = {}, {}
    decoded, reused = [], []
    for category, source in sorted(sources.items()):
        path = root / source["path"]
        check(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),
              "SOURCE_FILE")
        raw = path.read_bytes()
        sha = digest(raw)
        check(len(raw) == source["size"] and sha == source["sha256"], "SOURCE_DIGEST")
        prior = prior_files.get(category)
        if prior and prior["sha256"] == sha:
            rows = prior["frames"]
            reused.append(category)
        else:
            rows = decode(raw, category)
            decoded.append(category)
        for row in rows:
            check(row[0] not in active, "CROSS_CATEGORY_ID_COLLISION")
            active[row[0]] = (category,row)
        current[category] = {"sha256":sha, "frames":rows}
    added, modified, returned = [], [], []
    for item_id,(cat,row) in active.items():
        previous_row = prior_active.get(item_id)
        entry = history.get(item_id)
        if entry is None:
            # A newly observed definition after a complete comparison is
            # source introduction evidence, not proof of an original release date.
            entry = {"firstObservedVersion":version, "introducedVersion":version if old else None,
                     "introducedAfterVersion":old["gameVersion"] if old else None,
                     "introducedAfterSourceScanSha256":old["sourceScanSha256"] if old else None,
                     "introducedSourceScanSha256":scan_sha if old else None,
                     "contentReleaseId":content_release if old else None}
            history[item_id] = entry
            added.append(item_id)
        elif previous_row is None:
            returned.append(item_id)
        elif (previous_row[0],previous_row[1][1],previous_row[1][2]) != (cat,row[1],row[2]):
            modified.append(item_id)
        entry["lastObservedVersion"] = version
        entry["presentInCurrentSource"] = True
    missing = sorted(set(prior_active) - set(active))
    for item_id in set(history)-set(active):
        history[item_id]["presentInCurrentSource"] = False
    return {"schema":SCHEMA,"platform":"Steam","complete":True,"gameVersion":version,
            "versionFileSha256":version_sha,"sourceScanSha256":scan_sha,
            "previousLedgerSha256":previous_sha if old else None,
            "sourceFilesSha256":{cat:entry["sha256"] for cat,entry in current.items()},
            "sources":current,"history":{str(k):v for k,v in sorted(history.items())},
            "delta":{"decodedCategories":decoded,"reusedCategories":reused,
                     "newlyObservedIds":sorted(added),"changedFrameIds":sorted(modified),
                     "reappearedIds":sorted(returned),"absentInCurrentSourceIds":missing},
            "gameWideRemovalVerified":False,"runtimeAvailabilityVerified":False}

def public_history(ledger):
    return {"schema":"wand.db01.item-introduction@1","target":{"platform":"Steam","gameVersion":ledger["gameVersion"]},
            "sourceFilesSha256":ledger["sourceFilesSha256"],
            "sourceScanSha256":ledger["sourceScanSha256"],
            "items":[[int(k),{field:v[field] for field in (
                "firstObservedVersion","introducedVersion","introducedAfterVersion",
                "introducedAfterSourceScanSha256","introducedSourceScanSha256","contentReleaseId")}]
                for k,v in ledger["history"].items() if v["presentInCurrentSource"]]}

def write_atomic(path, value):
    path = Path(path).resolve()
    path.parent.mkdir(parents=True,exist_ok=True)
    raw = (json.dumps(value,ensure_ascii=False,separators=(",",":"),allow_nan=False)+"\n").encode()
    fd,tmp = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,"wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return digest(raw)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--game",type=Path,required=True)
    p.add_argument("--scan",type=Path,required=True)
    p.add_argument("--scan-sha256",required=True)
    p.add_argument("--previous",type=Path)
    p.add_argument("--previous-sha256")
    p.add_argument("--content-release-id")
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--public-history",type=Path,required=True)
    a = p.parse_args()
    check(bool(a.previous)==bool(a.previous_sha256),"PREVIOUS_PIN_REQUIRED")
    check(not a.content_release_id or (a.previous and re.fullmatch(r"[A-Za-z0-9_.-]{1,128}",a.content_release_id)),
          "CONTENT_RELEASE_ID")
    root=a.game.resolve()
    for path in (a.ledger,a.public_history):
        resolved=path.resolve()
        check(not resolved.is_relative_to(root) and resolved!=a.scan.resolve()
              and (not a.previous or resolved!=a.previous.resolve()),"OUTPUT_OVERLAPS_INPUT")
    check(a.ledger.resolve()!=a.public_history.resolve(),"OUTPUT_COLLISION")
    ledger=update(a.game,a.scan,a.scan_sha256,a.previous,a.previous_sha256,a.content_release_id)
    print(json.dumps({"ledgerSha256":write_atomic(a.ledger,ledger),
                      "publicHistorySha256":write_atomic(a.public_history,public_history(ledger)),
                      "decodedCategories":ledger["delta"]["decodedCategories"],
                      "reusedCategories":ledger["delta"]["reusedCategories"],
                      "new":len(ledger["delta"]["newlyObservedIds"]),
                      "changed":len(ledger["delta"]["changedFrameIds"])}))
if __name__=="__main__":
    main()
