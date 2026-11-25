#!/usr/bin/env python3
"""Read-only DDV Shop cache collector. Standard library; no network or game writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from datetime import datetime, timezone

SCHEMA = "wand.liveops.private-shop-catalog@1"
MAX_BYTES = 128 * 1024 * 1024

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()

def strict_object(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate JSON key")
        out[key] = value
    return out

def decode(raw):
    return json.loads(raw, object_pairs_hook=strict_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("nonfinite number")))

def private_path(path):
    p = path.resolve()
    if any((parent / ".git").exists() for parent in (p, *p.parents)):
        raise ValueError("private output must be outside Git")
    return p

def parse(raw):
    """Use the verified stores.dat envelope, not guessed native method results."""
    outer = decode(raw)
    data = outer["Data"]
    if not isinstance(data, dict) or not data:
        raise ValueError("empty cache or invalid Data")
    snapshots = []
    for key, encoded in data.items():
        snap = decode(encoded) if isinstance(encoded, str) else encoded
        if not isinstance(snap, dict) or snap["OnlineId"] != key:
            raise ValueError("snapshot identity mismatch")
        if not isinstance(snap["Categories"], list):
            raise ValueError("invalid Categories")
        header = {k: v for k, v in snap.items() if k != "Categories"}
        rows = []
        for category in snap["Categories"]:
            for kind, root in category["Data"].items():
                entries = [(None, o) for o in root.get("Bundles", [])]
                for store in root.get("Stores", []):
                    entries.extend((store["Id"], o) for o in store["Data"].get("BundleContents", []))
                for store_id, offer in entries:
                    oid, definition = offer["Id"], offer["Data"]
                    if not isinstance(oid, str) or not oid or definition["OnlineId"] != oid:
                        raise ValueError("offer identity mismatch")
                    contents = definition["Contents"]
                    if not isinstance(contents, list) or not contents:
                        raise ValueError("missing contents")
                    for part in contents:
                        if any(type(part[k]) is not int or not 0 < part[k] <= 9007199254740991
                               for k in ("ItemId", "Quantity")):
                            raise ValueError("invalid ItemId or Quantity")
                    # Keep exact native definition privately, including explicit nulls,
                    # per-component Price and image adjustments; no invented defaults.
                    rows.append((oid, kind, category.get("Title"), store_id, offer))
        snapshots.append((key, header, rows))
    return snapshots

DDL = """
CREATE TABLE IF NOT EXISTS sources(
 sha TEXT PRIMARY KEY, name TEXT NOT NULL, bytes INTEGER NOT NULL,
 game_version TEXT, imported_utc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots(
 source_sha TEXT NOT NULL REFERENCES sources(sha), snapshot_id TEXT NOT NULL,
 header TEXT NOT NULL, PRIMARY KEY(source_sha,snapshot_id));
CREATE TABLE IF NOT EXISTS revisions(
 revision_sha TEXT PRIMARY KEY, offer_id TEXT NOT NULL, definition TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations(
 source_sha TEXT NOT NULL, snapshot_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
 revision_sha TEXT NOT NULL REFERENCES revisions(revision_sha),
 category_type TEXT NOT NULL, category_title TEXT, store_id TEXT,
 PRIMARY KEY(source_sha,snapshot_id,ordinal),
 FOREIGN KEY(source_sha,snapshot_id) REFERENCES snapshots(source_sha,snapshot_id));
CREATE TABLE IF NOT EXISTS membership(
 revision_sha TEXT NOT NULL REFERENCES revisions(revision_sha),
 ordinal INTEGER NOT NULL, item_id INTEGER NOT NULL, quantity INTEGER NOT NULL,
 PRIMARY KEY(revision_sha,ordinal));
CREATE INDEX IF NOT EXISTS membership_item ON membership(item_id);
CREATE INDEX IF NOT EXISTS revision_offer ON revisions(offer_id);
"""

def connect(path):
    path = private_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.execute("PRAGMA foreign_keys=ON")
    version = db.execute("PRAGMA user_version").fetchone()[0]
    if version not in (0, 1):
        db.close()
        raise ValueError("unsupported database version")
    if version == 0 and db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]:
        db.close()
        raise ValueError("not an empty LiveOps database")
    db.executescript(DDL)
    db.execute("PRAGMA user_version=1")
    return db

def ingest(db, path, game_version=None):
    with path.open("rb") as f:
        raw = f.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("cache exceeds size limit")
    sha = hashlib.sha256(raw).hexdigest()
    if db.execute("SELECT 1 FROM sources WHERE sha=?", (sha,)).fetchone():
        return False
    snapshots = parse(raw)  # validate before any writes
    with db:
        db.execute("INSERT INTO sources VALUES(?,?,?,?,?)",
                   (sha, path.name, len(raw), game_version, datetime.now(timezone.utc).isoformat()))
        for key, header, rows in snapshots:
            db.execute("INSERT INTO snapshots VALUES(?,?,?)", (sha, key, canonical(header)))
            for i, (oid, kind, title, store, offer) in enumerate(rows):
                rev = digest(offer)
                db.execute("INSERT OR IGNORE INTO revisions VALUES(?,?,?)", (rev, oid, canonical(offer)))
                db.execute("INSERT INTO observations VALUES(?,?,?,?,?,?,?)",
                           (sha, key, i, rev, kind, title, store))
                for j, part in enumerate(offer["Data"]["Contents"]):
                    db.execute("INSERT OR IGNORE INTO membership VALUES(?,?,?,?)",
                               (rev, j, part["ItemId"], part["Quantity"]))
    return True

def summary(db):
    queries = {
        "sources": "SELECT count(*) FROM sources",
        "snapshots": "SELECT count(DISTINCT snapshot_id) FROM snapshots",
        "observations": "SELECT count(*) FROM observations",
        "offers": "SELECT count(DISTINCT offer_id) FROM revisions",
        "nativeRevisions": "SELECT count(*) FROM revisions",
        "items": "SELECT count(DISTINCT item_id) FROM membership",
    }
    return {k: db.execute(q).fetchone()[0] for k, q in queries.items()}

def catalog(db):
    sources = [{"sha256": s, "name": n, "bytes": b, "gameVersion": v, "importedUtc": t}
               for s,n,b,v,t in db.execute("SELECT * FROM sources ORDER BY sha")]
    snapshots = [{"sourceSha256": s, "snapshotId": i, "header": json.loads(h)}
                 for s,i,h in db.execute("SELECT * FROM snapshots ORDER BY source_sha,snapshot_id")]
    offers = {}
    for sha, oid, definition in db.execute("SELECT * FROM revisions ORDER BY offer_id,revision_sha"):
        offers.setdefault(oid, []).append({"revisionSha256": sha, "nativeOffer": json.loads(definition)})
    observations = [{"sourceSha256": s, "snapshotId": i, "ordinal": n, "revisionSha256": r,
                     "categoryType": k, "categoryTitle": t, "storeId": st,
                     "evidence": "received_shop_configuration",
                     "saleVerified": False, "currentlyAvailable": None}
                    for s,i,n,r,k,t,st in db.execute("SELECT * FROM observations ORDER BY source_sha,snapshot_id,ordinal")]
    index = {}
    for item, oid in db.execute("SELECT DISTINCT item_id,offer_id FROM membership JOIN revisions USING(revision_sha) ORDER BY item_id,offer_id"):
        index.setdefault(str(item), []).append(oid)
    return {"schema": SCHEMA, "privateOnly": True, "publicationAuthorized": False,
            "historicalCompletenessVerified": False, "sources": sources, "snapshots": snapshots,
            "offers": offers, "observations": observations, "itemToOffers": index,
            "summary": summary(db)}

def export(db, path):
    path = private_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError("use a new export path")
    with path.open("x", encoding="utf-8") as f:
        try:
            json.dump(catalog(db), f, ensure_ascii=False, indent=2, allow_nan=False)
        except BaseException:
            f.close()
            path.unlink()
            raise

def inputs(explicit, roots):
    files = set(p.resolve() for p in explicit)
    for root in roots:
        # Never enumerate save/account data; only select known cache names.
        for p in root.rglob("stores.dat*"):
            if p.is_file() and not p.is_symlink():
                files.add(p.resolve())
    return sorted(files)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db", required=True, type=Path)
    sub = p.add_subparsers(dest="command", required=True)
    add = sub.add_parser("ingest")
    add.add_argument("--cache", type=Path, action="append", default=[])
    add.add_argument("--cache-root", type=Path, action="append", default=[])
    add.add_argument("--game-version", help="actual source build, if known; not inferred")
    out = sub.add_parser("export")
    out.add_argument("--out", type=Path, required=True)
    sub.add_parser("summary")
    a = p.parse_args()
    db = connect(a.db)
    try:
        if a.command == "ingest":
            files = inputs(a.cache, a.cache_root)
            if not files:
                p.error("no stores.dat inputs found")
            added = skipped = failed = 0
            for file in files:
                try:
                    if ingest(db, file, a.game_version):
                        added += 1
                    else:
                        skipped += 1
                except (ValueError, KeyError, TypeError, OSError, sqlite3.Error) as exc:
                    failed += 1
                    print(canonical({"file": file.name, "errorType": type(exc).__name__}))
            print(canonical({"added": added, "skipped": skipped, "failed": failed, **summary(db)}))
            return 1 if failed else 0
        if a.command == "export":
            export(db, a.out)
        print(canonical(summary(db)))
        return 0
    finally:
        db.close()

if __name__ == "__main__":
    raise SystemExit(main())
