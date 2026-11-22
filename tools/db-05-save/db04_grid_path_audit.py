#!/usr/bin/env python3
"""DB-05 private exact GridDataPath join against a partial DB-04 native ZIP.

Read strictly decoded JSON on stdin; externally SHA-pin the private ZIP.
Output only fixed family names and anonymous counts, never source paths,
save map keys, player data, default object IDs or private ZIP members.

A native grid source path does NOT equal a numeric save grid ID.
Partial DB-04 coverage is not a save validity or editability gate.
"""
from collections import Counter
import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from native_catalog_crosscheck import strict_json

SCHEMA = "wand.db05.owner-private-native-grid-path-lookup@1"
MAX_INPUT = 128 * 1024 * 1024
MAX_ZIP = 32 * 1024 * 1024
MAX_SOURCE_JSON = 16 * 1024 * 1024
MAX_GRID_DEFINITIONS = 50000
MAX_SAVE_GRIDS = 200000
PATTERN = re.compile(r"GridData/(?:[A-Za-z0-9_!.\-]+/)*[A-Za-z0-9_!.\-]+\.json")
HASH = re.compile(r"[0-9a-f]{64}")
MAX_PATH = 512

def require(condition, reason):
    if not condition:
        raise ValueError("DB05_GRID_" + reason)

def hashbytes(blob):
    return hashlib.sha256(blob).hexdigest()

def load_partial_archive(filename, pinned_sha):
    require(isinstance(pinned_sha,str) and HASH.fullmatch(pinned_sha), "PIN_REQUIRED")
    path=Path(filename)
    require(path.is_file() and path.stat().st_size <= MAX_ZIP, "ARCHIVE_SIZE_INVALID")
    with path.open("rb") as fh:
        h=hashlib.sha256()
        for block in iter(lambda:fh.read(1024*1024),b""):
            h.update(block)
        require(h.hexdigest()==pinned_sha,"ARCHIVE_PIN_MISMATCH")
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        require(len(names)==len(set(names)) and len(names)<=32,"ARCHIVE_DUPLICATE_MEMBERS")
        require("manifest.json" in names and "grids.json" in names,"ARCHIVE_MISSING_MEMBERS")
        require(z.getinfo("manifest.json").file_size <= MAX_SOURCE_JSON,"MANIFEST_TOO_LARGE")
        manifest=strict_json(z.read("manifest.json"))
        require(isinstance(manifest,dict) and
            manifest.get("schema")=="wand.db04.world@1" and
            manifest.get("platform")=="Steam" and
            manifest.get("gameVersion")=="1.26.2" and
            manifest.get("status")=="partial_game_native_evidence" and
            manifest.get("sourceSubsetOnly") is True and
            manifest.get("sourceScopeVerified") is False and
            manifest.get("worldHierarchyComplete") is False and
            manifest.get("placementRulesComplete") is False,
            "PARTIAL_PROVENANCE_INVALID")
        checks=manifest.get("outputSha256")
        require(isinstance(checks,dict) and "grids.json" in checks,"OUTPUT_HASHES_REQUIRED")
        for entry,digest in checks.items():
            require(isinstance(entry,str) and
                re.fullmatch(r"[A-Za-z][A-Za-z0-9]*\.json",entry) and
                entry in names and isinstance(digest,str) and HASH.fullmatch(digest),
                "OUTPUT_ENTRY_INVALID")
            require(z.getinfo(entry).file_size <= MAX_SOURCE_JSON,"OUTPUT_ENTRY_TOO_LARGE")
            require(hashbytes(z.read(entry))==digest,"OUTPUT_HASH_MISMATCH")
        sources=manifest.get("sources")
        require(isinstance(sources,list) and len(sources)<=MAX_GRID_DEFINITIONS,
            "ORIGINAL_PROVENANCE_INVALID")
        verified_source={}
        for evidence in sources:
            require(isinstance(evidence,dict) and
                isinstance(evidence.get("path"),str) and
                isinstance(evidence.get("sha256"),str) and
                HASH.fullmatch(evidence["sha256"]) and
                type(evidence.get("bytes")) is int and
                0 <= evidence["bytes"] <= MAX_SOURCE_JSON and
                evidence["path"] not in verified_source,
                "ORIGINAL_SOURCE_RECORD_INVALID")
            verified_source[evidence["path"]]=evidence
        rows=strict_json(z.read("grids.json"))
        require(isinstance(rows,list) and len(rows)<=MAX_GRID_DEFINITIONS,
            "GRID_DEFINITION_COUNT_INVALID")
        native={}
        for row in rows:
            require(isinstance(row,dict) and isinstance(row.get("gridId"),str) and
                isinstance(row.get("source"),dict),"GRID_ROW_INVALID")
            key=row["gridId"]
            require(len(key)<=MAX_PATH and PATTERN.fullmatch(key) and key not in native,
                "GRID_PATH_DUPLICATE_OR_INVALID")
            expected="ddv_Data/StreamingAssets/"+key
            require(row["source"].get("path")==expected and
                expected in verified_source,"GRID_ORIGINAL_FILE_WITNESS_INVALID")
            native[key]=verified_source[expected]["sha256"]
        return {
            "gridPaths":frozenset(native),
            "definitionCount":len(native),
            "originalSourceEntries":len(verified_source),
            "verifiedArchiveEntries":len(checks),
            "gameVersion":manifest["gameVersion"],
        }

def scan_grid_paths(root, release):
    require(isinstance(root,dict) and isinstance(root.get("World"),dict) and
        isinstance(root.get("GameInfo"),dict),"SAVE_ROOT_INVALID")
    grid=root["World"].get("GridCollection")
    require(isinstance(grid,dict) and isinstance(grid.get("Grids"),dict),
        "SAVE_GRID_MAP_INVALID")
    rows=grid["Grids"]
    require(len(rows)<=MAX_SAVE_GRIDS,"SAVE_GRID_MAP_TOO_LARGE")
    seen=set()
    matched=0
    unmatched=0
    malformed=0
    counts=Counter()
    # Never read numeric map keys or treat them as original source paths.
    for record in rows.values():
        if not isinstance(record,dict):
            malformed+=1
            continue
        path=record.get("GridDataPath")
        if not isinstance(path,str) or len(path)>MAX_PATH or not PATTERN.fullmatch(path):
            malformed+=1
            continue
        seen.add(path)
        division=path.split("/")[1]
        if division not in ("Furniture","Villages","OffGridBuildings","Rooms",
                            "Worlds","Setless","FloatingIslands","ObstacleCourseArenas"):
            division="other"
        counts[division+".observed"]+=1
        if path in release["gridPaths"]:
            matched+=1
            counts[division+".matched"]+=1
        else:
            unmatched+=1
            counts[division+".notInPartialDb04"]+=1
    distinct_matched=sum(p in release["gridPaths"] for p in seen)
    revision=root["GameInfo"].get("Version")
    if type(revision) is not int or revision<0 or revision>2**53-1:
        revision=None
    by_category=[]
    for category in ("Villages","Furniture","OffGridBuildings","Rooms",
                     "Worlds","Setless","FloatingIslands",
                     "ObstacleCourseArenas","other"):
        n=counts[category+".observed"]
        if n:
            by_category.append({
                "category":category,
                "observed":n,
                "matched":counts[category+".matched"],
                "notInPartialDb04":counts[category+".notInPartialDb04"],
            })
    return {
        "schema":SCHEMA,
        "status":"partial_source_path_coverage" if unmatched or malformed else
            "all_observed_paths_in_supplied_partial_db04",
        "nativeDb04":{
            "platform":"Steam",
            "gameVersion":release["gameVersion"],
            "gridDefinitions":release["definitionCount"],
            "originalSourceMetadataRecords":release["originalSourceEntries"],
            "zipEntriesShaVerified":release["verifiedArchiveEntries"],
            "archiveShaMatchesExternalPin":True,
            "nativeSourceOriginalBytesIndependentlyRehashedHere":False,
            "originalFileShaEvidenceInheritedFromDb04":True,
            "wholeGameSourceCatalogComplete":False,
        },
        "save":{
            "schemaNumberObserved":revision,
            "totalGridRecords":len(rows),
            "validPaths":matched+unmatched,
            "distinctValidPaths":len(seen),
            "malformedGridPathOrRecord":malformed,
        },
        "join":{
            "matchedObservations":matched,
            "notInPartialDb04Observations":unmatched,
            "matchedDistinctPaths":distinct_matched,
            "notInPartialDb04DistinctPaths":len(seen)-distinct_matched,
            "numericSaveGridIdUsedAsSourceKey":False,
            "fullyIndexedAllNativeGridPaths":False,
            "missingInPartialCatalogIsNotSaveCorruption":True,
            "exactPathMeansMetadataCandidateOnly":True,
            "fullBuildIdentityVerified":False,
        },
        "byPartition":by_category,
        "claims":{
            "originalSaveModified":False,"privateGridSourceExported":False,
            "worldPositionVerified":False,"collisionOrPlacementRulesVerified":False,
            "sourceAndSaveExecutableBuildJointlyVerified":False,
            "editorWriterAuthorized":False,"exportAuthorized":False
        },
    }

def main():
    ap=argparse.ArgumentParser(add_help=False)
    ap.add_argument("--db04-archive",required=True)
    ap.add_argument("--expected-sha256",required=True)
    args=ap.parse_args()
    payload=sys.stdin.buffer.read(MAX_INPUT+1)
    require(0<len(payload)<=MAX_INPUT,"SAVE_INPUT_BOUNDS")
    save=strict_json(payload)
    db04=load_partial_archive(args.db04_archive,args.expected_sha256)
    result=scan_grid_paths(save,db04)
    sys.stdout.write(json.dumps(result,sort_keys=True,separators=(",",":"))+"\n")

if __name__=="__main__":
    try:
        main()
    except Exception:
        sys.stderr.write("DB05_PRIVATE_GRID_PATH_AUDIT_FAILED\n")
        sys.exit(1)
