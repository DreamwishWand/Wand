"""Private, incremental ItemID source inventory from verified SRC-00 scans.

Reuses unchanged source files without decoding; compares exact frame payloads for
changed files, retains history even for absent definitions, and never equates
source presence with player availability or DLC membership. No network or upload.
"""
import argparse
import base64
import zlib
import hashlib
import gzip
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

# Release context describes a source transition, never every item's DLC
# ownership or release attribution. The two known boundaries are Owner-confirmed.
RELEASE_CONTEXTS = {
    ("1.25.3", "1.26.1"): ("dlc.the-keepsake-sea", "paid_dlc"),
    ("1.26.1", "1.26.2"): ("hotfix.1.26.2", "hotfix"),
}
RELEASE_ID = re.compile(r"[A-Za-z0-9_.-]{1,128}\Z")
def release_context(before, after, explicit_id=None, explicit_kind=None):
    known=RELEASE_CONTEXTS.get((before,after))
    if known:
        check(explicit_id in (None,known[0]) and explicit_kind in (None,known[1]),
              "RELEASE_CONTEXT_CONFLICT")
        return known
    if explicit_id is None and explicit_kind is None:
        return None,None
    check(isinstance(explicit_id,str) and RELEASE_ID.fullmatch(explicit_id) and
          explicit_kind in ("free_update","paid_dlc","hotfix","other"),"RELEASE_CONTEXT")
    return explicit_id,explicit_kind

def apply_content_assignments(history, active, scan_sha, assignments, assignments_sha):
    # Owner-reviewed, per-ID evidence. A hash pins the reviewed input; it
    # does not by itself prove the semantic attribution of a game definition.
    doc=pinned_json(assignments,assignments_sha)
    check(doc.get("schema")=="wand.db01.reviewed-content-attribution@1" and
          doc.get("sourceScanSha256")==scan_sha and isinstance(doc.get("items"),list),
          "CONTENT_ASSIGNMENT_SOURCE")
    seen=set()
    for row in doc["items"]:
        item_id=row.get("itemId")
        release_id=row.get("contentReleaseId")
        kind=row.get("contentReleaseKind")
        dlc_type=row.get("contentDlcType")
        evidence=row.get("evidenceSha256")
        check(type(item_id) is int and item_id in active and item_id not in seen and
              isinstance(release_id,str) and RELEASE_ID.fullmatch(release_id) and
              (kind=="free_update" and dlc_type is None and re.fullmatch(r"version\.\d+",release_id)
               or kind=="paid_dlc" and dlc_type in ("expansion","adventure_pack") and release_id.startswith("dlc.")) and
              isinstance(evidence,str) and SHA.fullmatch(evidence),"CONTENT_ASSIGNMENT_ROW")
        entry=history[item_id]
        check(entry.get("introducedVersion") is not None,"CONTENT_ASSIGNMENT_INTRODUCTION_UNKNOWN")
        check(entry.get("contentReleaseId") in (None,release_id),"CONTENT_ASSIGNMENT_CONFLICT")
        entry.update(contentReleaseId=release_id,contentReleaseKind=kind,contentDlcType=dlc_type,
                     contentReleaseEvidenceSha256=evidence,contentAssignmentSha256=assignments_sha)
        seen.add(item_id)

def corpus_digest(source_hashes):
    return digest(json.dumps(source_hashes,sort_keys=True,separators=(",",":")).encode())

def historical_seed(active, source_hashes):
    # Only the exact verified current original corpus may initialize the
    # historical census. No game version string alone permits this inference.
    corpus=corpus_digest(source_hashes)
    if corpus!="1f336ebb22061b588008d004e725bb7d56bd5cd6da1765520efd2aad4c115744":
        return {}
    repo=Path(__file__).resolve().parents[2]
    h=json.loads((repo/"data/ddv/item-master/historical-source-delta-steam-1253-1262.json").read_bytes())
    check(h["schema"]=="wand.db01.historical-source-delta@1" and h["platform"]=="Steam"
          and h["sourceCensus"]==39,"HISTORICAL_DELTA")
    before,expansion,hotfix=h["snapshots"]
    encode=lambda rows: json.dumps(rows,separators=(",",":")).encode()
    current=sorted(active)
    check(hotfix["sourceCorpusSha256"]==corpus and len(current)==hotfix["definitionCount"]
          and digest(encode(current))==hotfix["itemIdsSha256"],"HISTORICAL_CURRENT_IDS")
    d=h["delta1253to1261"];fix=h["delta1261to1262"]
    runs=json.loads(zlib.decompress(base64.b64decode(d["newIdRuns"],validate=True)))
    check(isinstance(runs,list) and len(runs)%2==0 and len(runs)<=10000,"HISTORICAL_RUNS")
    added=[];last=0
    for gap,n in zip(runs[::2],runs[1::2]):
        check(type(gap) is int and gap>0 and type(n) is int and n>0 and len(added)+n<=3254,"HISTORICAL_RUN")
        start=last+gap
        added.extend(range(start,start+n));last=start+n-1
    check(len(added)==3254 and digest(encode(added))==
          "ec995d4f8253312dc6990f38c1e5ba8ccbbf42e3c7b0d14fb4e5ac76868ba7c3","HISTORICAL_NEW_IDS")
    hot=set(fix["newIds"]);added=set(added)
    check(hot=={2130007038} and not hot&added and (hot|added).issubset(active),"HISTORICAL_HOTFIX")
    at1261=sorted(set(active)-hot)
    at1253=sorted((set(at1261)-added)|set(d["absentIds"]))
    check(len(at1261)==expansion["definitionCount"] and digest(encode(at1261))==expansion["itemIdsSha256"]
          and len(at1253)==before["definitionCount"] and digest(encode(at1253))==before["itemIdsSha256"],
          "HISTORICAL_PREVIOUS_IDS")
    shop=h["shopObservation"]
    shopdoc=pinned_json(repo/shop["sourcePath"],shop["sourceSha256"])
    shopids={int(x[0]) for offer in shopdoc["offers"] for x in offer[5]}
    check(sorted(added&shopids)==shop["newItemIds"] and shopdoc["source"]["snapshotKey"]==shop["snapshotKey"],
          "HISTORICAL_SHOP_IDS")
    result={}
    for item_id in set(at1253)|set(active):
        ishot=item_id in hot;isnew=item_id in added
        target=hotfix if ishot else expansion if isnew else before
        prior=expansion if ishot else before if isnew else None
        key=active[item_id][1][1].lower() if item_id in active else ""
        result[item_id]={
            "firstObservedVersion":target["version"],"introducedVersion":target["version"] if prior else None,
            "introducedAfterVersion":prior["version"] if prior else None,
            "introducedAfterSourceScanSha256":None,"introducedSourceScanSha256":None,
            "introducedAfterSourceCorpusSha256":prior["sourceCorpusSha256"] if prior else None,
            "introducedSourceCorpusSha256":target["sourceCorpusSha256"] if prior else None,
            "sourceReleaseId":"hotfix.1.26.2" if ishot else "dlc.the-keepsake-sea" if isnew else None,
            "sourceReleaseKind":"hotfix" if ishot else "paid_dlc" if isnew else None,
            "contentReleaseId":None,"contentReleaseKind":None,"contentDlcType":None,
            "contentReleaseEvidenceSha256":None,"contentAssignmentSha256":None,
            "nativeContentMarker":("expansion04" if "expansion04" in key else "update26" if "update26" in key else None) if isnew else None,
            "introductionShopSnapshot":shop["snapshotKey"] if item_id in shop["newItemIds"] else None,
            "lastObservedVersion":"1.26.2" if item_id in active else "1.25.3",
            "presentInCurrentSource":item_id in active
        }
    return result

def update(root, scan, scan_sha, previous=None, previous_sha=None, content_release=None,
           bootstrap_archive=None, source_release_kind=None, assignments=None, assignments_sha=None):
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
    earlier_presence = set()
    if bootstrap_archive:
        check(not old and version=="1.26.2","BOOTSTRAP_VERSION")
        packed=Path(bootstrap_archive).read_bytes()
        check(digest(packed)=="b659cfc12b3a1363395e595bc5bb6be76ef1da63b6003c3a785556adc3a6831d",
              "BOOTSTRAP_ARCHIVE_PIN")
        master=json.loads(gzip.decompress(packed))
        check(master["target"]=={"platform":"Steam","gameVersion":"1.26.2"}
              and master["sourceFilesSha256"]=={cat:entry["sha256"] for cat,entry in sources.items()},
              "BOOTSTRAP_SOURCE")
        earlier_presence={r["itemId"] for r in master["items"] if r["nativeCategory"]!="Condition"}
        check(len(earlier_presence)==33627,"BOOTSTRAP_CENSUS")
    check(bool(assignments)==bool(assignments_sha),"CONTENT_ASSIGNMENT_PIN_REQUIRED")
    source_release_id,source_kind=release_context(old["gameVersion"] if old else None,version,
                                                 content_release,source_release_kind)
    prior_files = old["sources"] if old else {}
    prior_active = {r[0]: (cat,r) for cat, entry in prior_files.items() for r in entry["frames"]}
    history = {int(k):dict(v) for k,v in (old["history"].items() if old else [])}
    # Legacy ledgers used a transition-wide ID as an item attribution.
    # Preserve it as context only, unless a reviewed per-ID proof exists.
    for entry in history.values():
        if entry.get("contentReleaseId") and not entry.get("contentAssignmentSha256"):
            entry.setdefault("sourceReleaseId",entry["contentReleaseId"])
            entry["contentReleaseId"]=None
        for field in ("sourceReleaseId","sourceReleaseKind","contentReleaseId","contentReleaseKind",
                      "contentDlcType","contentReleaseEvidenceSha256","contentAssignmentSha256"):
            entry.setdefault(field,None)
    if old and old["gameVersion"]=="1.26.2":
        seed=historical_seed(prior_active,old["sourceFilesSha256"])
        for item_id,record in seed.items():
            prior=history.get(item_id,{})
            # Existing reviewed content assignments survive only when their
            # introduction interval agrees with the exact historical evidence.
            reviewed={k:prior[k] for k in ("contentReleaseId","contentReleaseKind","contentDlcType",
                "contentReleaseEvidenceSha256","contentAssignmentSha256") if k in prior} if (
                prior.get("contentAssignmentSha256") and prior.get("introducedVersion")==record["introducedVersion"]) else {}
            history[item_id]={**prior,**record,**reviewed}
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
    current_hashes={cat:entry["sha256"] for cat,entry in current.items()}
    if not old and version=="1.26.2":
        history.update(historical_seed(active,current_hashes))
    added, modified, returned = [], [], []
    for item_id,(cat,row) in active.items():
        previous_row = prior_active.get(item_id)
        entry = history.get(item_id)
        if entry is None:
            # A newly observed definition after a complete comparison is
            # source introduction evidence, not proof of an original release date.
            entry = {"firstObservedVersion":"1.26.1" if item_id in earlier_presence else version, "introducedVersion":version if old else None,
                     "introducedAfterVersion":old["gameVersion"] if old else None,
                     "introducedAfterSourceScanSha256":old["sourceScanSha256"] if old else None,
                     "introducedSourceScanSha256":scan_sha if old else None,
                     "introducedAfterSourceCorpusSha256":corpus_digest(old["sourceFilesSha256"]) if old else None,
                     "introducedSourceCorpusSha256":corpus_digest(current_hashes) if old else None,
                     "sourceReleaseId":source_release_id if old else None,
                     "sourceReleaseKind":source_kind if old else None,
                     "contentReleaseId":None,"contentReleaseKind":None,"contentDlcType":None,
                     "contentReleaseEvidenceSha256":None,"contentAssignmentSha256":None,
                     "nativeContentMarker":None,"introductionShopSnapshot":None}
            history[item_id] = entry
            added.append(item_id)
        elif previous_row is None and old:
            returned.append(item_id)
        elif previous_row is not None and (previous_row[0],previous_row[1][1],previous_row[1][2]) != (cat,row[1],row[2]):
            modified.append(item_id)
        entry["lastObservedVersion"] = version
        entry["presentInCurrentSource"] = True
    missing = sorted(set(prior_active) - set(active))
    for item_id in set(history)-set(active):
        history[item_id]["presentInCurrentSource"] = False
    if assignments:
        apply_content_assignments(history,active,scan_sha,assignments,assignments_sha)
    return {"schema":SCHEMA,"platform":"Steam","complete":True,"gameVersion":version,
            "sourceReleaseId":source_release_id,"sourceReleaseKind":source_kind,
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
            "items":[[int(k),{field:v.get(field) for field in (
                "firstObservedVersion","introducedVersion","introducedAfterVersion",
                "introducedAfterSourceScanSha256","introducedSourceScanSha256","introducedAfterSourceCorpusSha256",
                "introducedSourceCorpusSha256","nativeContentMarker","introductionShopSnapshot","sourceReleaseId","sourceReleaseKind",
                "contentReleaseId","contentReleaseKind","contentDlcType","contentReleaseEvidenceSha256",
                "contentAssignmentSha256")}]
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
    p.add_argument("--source-release-id","--content-release-id",dest="source_release_id",
                   help="Source transition context only; never per-item attribution")
    p.add_argument("--source-release-kind",choices=("free_update","paid_dlc","hotfix","other"))
    p.add_argument("--content-assignments",type=Path)
    p.add_argument("--content-assignments-sha256")
    p.add_argument("--bootstrap-1262-archive",type=Path,help="Concatenated exact verified complete-source .json.gz archive; only initial 1.26.2 inventory")
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--public-history",type=Path,required=True)
    a = p.parse_args()
    check(bool(a.previous)==bool(a.previous_sha256),"PREVIOUS_PIN_REQUIRED")
    check(not a.source_release_id or a.previous,"RELEASE_CONTEXT_REQUIRES_BASELINE")
    check(bool(a.content_assignments)==bool(a.content_assignments_sha256),"CONTENT_ASSIGNMENT_PIN_REQUIRED")
    root=a.game.resolve()
    for path in (a.ledger,a.public_history):
        resolved=path.resolve()
        check(not resolved.is_relative_to(root) and resolved!=a.scan.resolve()
              and (not a.previous or resolved!=a.previous.resolve())
              and (not a.bootstrap_1262_archive or resolved!=a.bootstrap_1262_archive.resolve())
              and (not a.content_assignments or resolved!=a.content_assignments.resolve()),"OUTPUT_OVERLAPS_INPUT")
    check(a.ledger.resolve()!=a.public_history.resolve(),"OUTPUT_COLLISION")
    ledger=update(a.game,a.scan,a.scan_sha256,a.previous,a.previous_sha256,a.source_release_id,a.bootstrap_1262_archive,a.source_release_kind,
                  a.content_assignments,a.content_assignments_sha256)
    print(json.dumps({"ledgerSha256":write_atomic(a.ledger,ledger),
                      "publicHistorySha256":write_atomic(a.public_history,public_history(ledger)),
                      "decodedCategories":ledger["delta"]["decodedCategories"],
                      "reusedCategories":ledger["delta"]["reusedCategories"],
                      "new":len(ledger["delta"]["newlyObservedIds"]),
                      "changed":len(ledger["delta"]["changedFrameIds"])}))
if __name__=="__main__":
    main()
