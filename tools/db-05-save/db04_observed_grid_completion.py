#!/usr/bin/env python3
"""DB-05 private exact QwX-observed GridData extension from Steam originals.

The saved numeric Grid IDs are never joined to source paths. All derived
sources and the combined DB-04 geometry index are owner-private outputs.
Only original native grid definitions, not player edits, are included.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import zipfile

from db04_grid_path_audit import (
    PATTERN, MAX_PATH, MAX_SAVE_GRIDS,
    load_partial_archive, scan_grid_paths, require,
)
from native_catalog_crosscheck import strict_json

DB04_ROOT=Path(__file__).resolve().parents[1]/"db-04-world"
sys.path.insert(0,str(DB04_ROOT))
from world import parse_grid_structure

SCHEMA="wand.db05.private-observed-grid-source-extension@1"
GAME_VERSION="1.26.2"
MAX_JSON_BYTES=128*1024*1024
MAX_SOURCE_BYTES=16*1024*1024
MAX_TOTAL_SOURCE_BYTES=64*1024*1024
MAX_GRID_PATHS=20000

def digest(b):return hashlib.sha256(b).hexdigest()

def jsonbytes(v):
    return json.dumps(v,ensure_ascii=False,sort_keys=True,
        separators=(",",":")).encode("utf-8")

def read_native_source(root,name):
    require(len(name)<=MAX_PATH and PATTERN.fullmatch(name) is not None,
        "INVALID_NATIVE_GRID_PATH")
    require(root.is_dir() and not root.is_symlink(),"NATIVE_SOURCE_ROOT_INVALID")
    path=root
    for part in Path(name).parts:
        path=path/part
        require(not path.is_symlink(),"SOURCE_SYMLINK_FORBIDDEN")
    require(path.is_file() and 0<path.stat().st_size<=MAX_SOURCE_BYTES,
        "NATIVE_SOURCE_FILE_MISSING_OR_OVERSIZED")
    return path.read_bytes()

def create_extension(decoded,db04_zip,externally_pinned_sha,native_root):
    existing=load_partial_archive(db04_zip,externally_pinned_sha)
    require(existing["gameVersion"]==GAME_VERSION,"BASE_VERSION_NOT_EXPECTED")
    initial=scan_grid_paths(decoded,existing)
    require(initial["save"]["malformedGridPathOrRecord"]==0,
        "SAVED_GRID_PATH_MALFORMED")
    saved=decoded["World"]["GridCollection"]["Grids"]
    require(len(saved)<=MAX_SAVE_GRIDS,"SAVE_GRID_RECORD_LIMIT")
    observed_paths={v["GridDataPath"] for v in saved.values()}
    require(len(observed_paths)<=MAX_GRID_PATHS,"GRID_PATH_COUNT_LIMIT")
    missing_paths=sorted(observed_paths-existing["gridPaths"])
    with zipfile.ZipFile(db04_zip) as z:
        # load_partial_archive independently SHA-validates this entire ZIP
        # and the member hashes recorded in DB-04's original manifest.
        old_rows=strict_json(z.read("grids.json"))
    require(isinstance(old_rows,list) and
            len(old_rows)==existing["definitionCount"],"BASE_GRID_COUNT_INVALID")
    added_rows=[]
    provenance=[]
    formats=Counter()
    sources_size=0
    cells=0
    for path in missing_paths:
        raw=read_native_source(native_root,path)
        sources_size+=len(raw)
        require(sources_size<=MAX_TOTAL_SOURCE_BYTES,"TOTAL_NATIVE_SOURCE_LIMIT")
        try:
            row=parse_grid_structure(raw,source_game_version=GAME_VERSION)
        except (ValueError,UnicodeError,TypeError,KeyError):
            # Never fabricate missing grid geometry after a decoding failure.
            require(False,"ORIGINAL_NATIVE_GRID_PARSER_REJECTED_SOURCE")
        require(isinstance(row,dict) and
                type(row.get("sizeX")) is int and
                type(row.get("sizeY")) is int and
                0<row["sizeX"]*row["sizeY"]<=16777216,
                "GRID_NATIVE_GEOMETRY_INVALID")
        require(row.get("status") in {
            "native_compacted_palette_and_index_bytes",
            "native_uncompacted_floor_values","dimensions_only"
        },"GRID_NATIVE_TERRAIN_STATUS_UNRECOGNIZED")
        native_path="ddv_Data/StreamingAssets/"+path
        row.update({
            "gridId":path,
            "sourcePartition":path.split("/")[1],
            "source":{"path":native_path},
        })
        added_rows.append(row)
        provenance.append({
            "path":native_path,
            "bytes":len(raw),"sha256":digest(raw),
            "sourceGameVersion":GAME_VERSION,
        })
        formats[row["status"]]+=1
        formats["plain_json" if raw.lstrip().startswith(b"{")
                else "protobuf_binary"]+=1
        cells+=row["sizeX"]*row["sizeY"]
    combined=sorted([*old_rows,*added_rows],key=lambda x:x["gridId"])
    all_keys=[x.get("gridId") for x in combined]
    require(len(all_keys)==len(set(all_keys)) and
            len(combined)==len(old_rows)+len(added_rows),
            "NATIVE_GRID_ID_DUPLICATED")
    require(observed_paths<=set(all_keys),"OBSERVED_PATH_COVERAGE_INCOMPLETE")
    require(initial["join"]["notInPartialDb04DistinctPaths"]==len(added_rows),
            "SUPPLEMENT_PATH_COUNT_MISMATCH")
    new_observations=sum(v["GridDataPath"] in set(missing_paths)
                         for v in saved.values())
    require(initial["join"]["matchedObservations"]+new_observations==
            initial["save"]["totalGridRecords"],
            "GRID_REFERENCE_COUNT_MISMATCH")
    total=len(observed_paths)
    report={
        "schema":SCHEMA,
        "status":"all_observed_grid_paths_indexed_from_source",
        "counts":{
            "saveGridRecords":len(saved),
            "distinctSaveGridDataPaths":total,
            "previousDb04PartialGridDefinitions":len(old_rows),
            "previouslyMatchedObservedPaths":
                initial["join"]["matchedDistinctPaths"],
            "newGridDefinitionFilesVerified":len(added_rows),
            "newGridReferenceObservations":new_observations,
            "newNativeOriginalBytes":sources_size,
            "newNativeGridCells":cells,
            "newSourceProtobufBinary":formats["protobuf_binary"],
            "newSourceDirectJson":formats["plain_json"],
            "newCompactedGridDefinitions":
                formats["native_compacted_palette_and_index_bytes"],
            "newDirectFloorValueGridDefinitions":
                formats["native_uncompacted_floor_values"],
            "newDimensionsOnlyGridDefinitions":formats["dimensions_only"],
            "totalCombinedDb04GridDefinitions":len(combined),
            "observedPathsNowIndexed":total,
            "observedPathsUnindexed":0,
        },
        "provenance":{
            "steamVersion":GAME_VERSION,
            "saveSchemaNumberObserved":initial["save"]["schemaNumberObserved"],
            "partialDb04ZipExternallyShaPinned":True,
            "newOriginalNativeSourceBytesSha256Recorded":True,
            "individualNewSourceHashesExternallyPinnedBeforeRun":False,
            "fullSteamSwitchExecutableIdentityVerified":False,
        },
        "safety":{
            "allObservedSourcePathsCovered":True,
            "fullNativeGameWorldIndexed":False,
            "savedNumericGridIdsUsedAsOriginalPaths":False,
            "sourceFilesOrSaveMutated":False,
            "objectPlacementPermissionVerified":False,
            "worldCoordinateTransformVerified":False,
            "editorWriterAuthorized":False,
            "exportAuthorized":False,
        },
    }
    payloads={
        "extended-grids.json":jsonbytes(combined),
        "new-source-provenance.json":jsonbytes(provenance),
        "report.json":jsonbytes(report),
    }
    manifest={
        "schema":SCHEMA,"gameVersion":GAME_VERSION,
        "sourcePlatform":"Steam",
        "baseDb04ArchiveSha256":externally_pinned_sha,
        "baseDefinitions":len(old_rows),
        "newDefinitions":len(added_rows),
        "totalDefinitions":len(combined),
        "observedSavePaths":total,
        "allObservedSavePathsCovered":True,
        "fullOriginalGameGridIndex":False,
        "originalGameFilesEmbedded":False,
        "originalSaveEmbedded":False,
        "newSourceOriginalByteDigestsRecorded":True,
        "priorIndependentRawSourceHashesValidated":False,
        "editorWriterAuthorized":False,
        "exportAuthorized":False,
        "memberSha256":{k:digest(v) for k,v in sorted(payloads.items())},
    }
    payloads["manifest.json"]=jsonbytes(manifest)
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED,
                         compresslevel=9) as z:
        for name in sorted(payloads):
            z.writestr(name,payloads[name])
    require(len(b.getvalue())<=96*1024*1024,"EXTENDED_INDEX_OVERSIZED")
    return report,b.getvalue()

def save_without_clobber(report_name,zip_name,report,zipblob):
    destinations=(Path(report_name),Path(zip_name))
    require(destinations[0]!=destinations[1],"OUTPUT_COLLISION")
    for path in destinations:
        require(path.parent.is_dir() and
                not path.exists() and not path.is_symlink(),
                "OUTPUT_PARENT_OR_OVERWRITE_INVALID")
    report_data=json.dumps(report,sort_keys=True,ensure_ascii=False,
                           indent=2).encode("utf-8")+b"\n"
    temporary=[]
    committed=[]
    try:
        for path,blob in zip(destinations,(report_data,zipblob)):
            fd,name=tempfile.mkstemp(prefix=".db05-private-",
                dir=path.parent)
            temporary.append(Path(name))
            os.fchmod(fd,0o600)
            with os.fdopen(fd,"wb") as f:f.write(blob)
        for path,tmp in zip(destinations,temporary):
            os.link(tmp,path)
            committed.append(path)
    except BaseException:
        for path in committed:path.unlink(missing_ok=True)
        raise
    finally:
        for tmp in temporary:tmp.unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser(add_help=False)
    p.add_argument("--db04-archive",required=True)
    p.add_argument("--expected-db04-sha256",required=True)
    p.add_argument("--native-grid-root",required=True)
    p.add_argument("--out-report",required=True)
    p.add_argument("--out-zip",required=True)
    opt=p.parse_args()
    data=sys.stdin.buffer.read(MAX_JSON_BYTES+1)
    require(0<len(data)<=MAX_JSON_BYTES,"SAVE_JSON_INPUT_OVERSIZED")
    profile=strict_json(data)
    report,bundle=create_extension(
        profile,Path(opt.db04_archive),opt.expected_db04_sha256,
        Path(opt.native_grid_root))
    save_without_clobber(opt.out_report,opt.out_zip,report,bundle)
    print(json.dumps({
        "schema":SCHEMA,
        "savedGridRecords":report["counts"]["saveGridRecords"],
        "distinctObservedPaths":report["counts"]["distinctSaveGridDataPaths"],
        "newVerifiedOriginalSources":
            report["counts"]["newGridDefinitionFilesVerified"],
        "completeForThisSave":True,
        "completeOriginalGameWorld":False,
        "writerAuthorized":False,
    },separators=(",",":")))

if __name__=="__main__":
    try:main()
    except Exception:
        # No private account, file path, SHA, raw JSON or source data in stderr.
        print("DB05_PRIVATE_GRID_SOURCE_EXTENSION_FAILED",file=sys.stderr)
        sys.exit(1)
