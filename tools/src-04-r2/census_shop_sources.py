#!/usr/bin/env python3
"""Read-only Shop census over installed game sources, not a rotation cache.

Inventory every source file; inspect plain structured data, LocDB members,
ProtoDB envelopes, split Addressables, raw identifiers, Unity serialized
objects (all bundles/assets) and embedded TextAssets. Evidence candidates are
NOT confirmed historical Offers. No network, no save/cache access, no writes
inside the installation, no image extraction. UnityPy required.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import zipfile

LOCALES = {"en-US":"en", "fr":"fr", "it":"it", "de":"de",
           "es":"es-ES", "ja":"ja", "zh-CN":"zh-CN", "pt-BR":"pt-BR"}
# Deliberately wider than Bundle_ alone; retain every Liveops title separately.
IDENT = re.compile(rb"(?<![A-Za-z0-9_])(?:MegaBundle|SeasonBundle|DreamBundle|VanityBundle|SignatureBundle|CompanionBundle|HeroItem|HouseSkin|Bundle|Item)[A-Za-z0-9_]{1,180}(?![A-Za-z0-9_])")
HINT = re.compile(r"premium.?shop|promoart|onlinebundle|storecontentbundle|getbundlescontainingitem|getshopbundlecontents|allbundles|miragebundle", re.I)
KEY_HINT = re.compile(r"^(?:MegaBundle|SeasonBundle|DreamBundle|VanityBundle|SignatureBundle|CompanionBundle|HeroItem|HouseSkin|Bundle|Item)", re.I)
MAX_STRUCTURED = 256 * 1024 * 1024
BLOCK = 4 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def wire(data):
    def varint(i):
        value = 0
        for shift in range(0, 70, 7):
            if i >= len(data):
                raise ValueError("truncated varint")
            b = data[i]
            i += 1
            value |= (b & 127) << shift
            if b < 128:
                return value, i
        raise ValueError("overlong varint")
    i = 0
    while i < len(data):
        tag, i = varint(i)
        n, typ = tag >> 3, tag & 7
        if not n:
            raise ValueError("invalid field")
        if typ == 0:
            value, i = varint(i)
        elif typ in (1, 5):
            size = 8 if typ == 1 else 4
            if i + size > len(data):
                raise ValueError("truncated fixed field")
            value, i = data[i:i+size], i+size
        elif typ == 2:
            size, i = varint(i)
            if size > len(data)-i:
                raise ValueError("truncated length-delimited field")
            value, i = data[i:i+size], i+size
        else:
            raise ValueError("unsupported wire type")
        yield n, typ, value


def unique_text(fields, number):
    vals = [v for n,t,v in fields if n == number and t == 2]
    return vals[0].decode("utf-8") if len(vals) == 1 else None


def locbin(raw):
    rows = {}
    for n, t, value in wire(raw):
        if (n,t) != (1,2):
            raise ValueError("unexpected locbin frame")
        f = list(wire(value))
        if [(a,b) for a,b,_ in f] not in ([(1,2)], [(1,2),(2,2)]):
            raise ValueError("unexpected locbin entry")
        key = f[0][2].decode("utf-8")
        if not key or key in rows:
            raise ValueError("duplicate or empty localization key")
        rows[key] = f[1][2].decode("utf-8") if len(f) == 2 else None
    return rows


def scan_ident(data):
    # Both ordinary metadata and UTF-16 strings in executable data.
    result = {m.group().decode("ascii") for m in IDENT.finditer(data)}
    for phase in (0, 1):
        text = data[phase:len(data)-((len(data)-phase)%2)].decode("utf-16-le", errors="replace")
        # ASCII-encode only after replacing non-ASCII with a delimiter.
        result.update(m.group().decode("ascii") for m in IDENT.finditer(text.encode("ascii", "replace")))
    return result


def canonical_candidate(value):
    if not isinstance(value, dict):
        return None
    oid = value.get("OnlineId")
    contents = value.get("Contents")
    if not isinstance(oid, str) or not oid or not isinstance(contents, list) or not contents:
        return None
    if any(not isinstance(x, dict) or type(x.get("ItemId")) is not int
           or x["ItemId"] <= 0 or type(x.get("Quantity")) is not int
           or x["Quantity"] <= 0 for x in contents):
        return None
    return {"onlineId":oid, "title":value.get("Title"),
            "contents":[[x["ItemId"],x["Quantity"]] for x in contents],
            "visual":{k:value[k] for k in ("Image","Background","Layout","LightLayout",
                      "AdjustImage","ImageAdjustment","MegaBundleAdjustment") if k in value},
            "status":"structured_candidate_requires_native_type_confirmation"}


class Census:
    def __init__(self):
        self.count = Counter()
        self.errors = []
        self.files = []
        self.raw_ids = defaultdict(set)
        self.title_keys = defaultdict(dict)
        self.locale_members = []
        self.classes = Counter()
        self.proto_candidates = []
        self.structured = []
        self.art = []
        self.paths = []

    def issue(self, source, stage, exc):
        self.errors.append({"source":source,"stage":stage,"error":type(exc).__name__})

    def identifiers(self, raw, source):
        for ident in scan_ident(raw):
            self.raw_ids[ident].add(source)

    def tree(self, obj, source, depth=0):
        if depth > 128:
            raise ValueError("structured depth exceeded")
        if isinstance(obj, dict):
            match = canonical_candidate(obj)
            if match:
                self.structured.append({"source":source, **match})
            for key, value in obj.items():
                self.tree(value, source+"/"+str(key), depth+1)
        elif isinstance(obj, (list, tuple)):
            for i, value in enumerate(obj):
                self.tree(value, source+"/"+str(i), depth+1)
        elif isinstance(obj, str):
            stripped = obj.lstrip()
            if stripped.startswith(("{","[")) and len(obj) < MAX_STRUCTURED:
                try:
                    parsed = json.loads(obj)
                except (ValueError, RecursionError):
                    return
                self.tree(parsed, source+"/embedded-json", depth+1)

    def proto(self, raw, source):
        seen = set()
        for i,(n,t,value) in enumerate(wire(raw)):
            if (n,t) != (1,2):
                raise ValueError("unexpected ProtoDB frame")
            f = list(wire(value))
            name = unique_text(f,1)
            envelope = [v for a,b,v in f if (a,b)==(2,2)]
            if not name or name in seen or len(envelope)!=1:
                raise ValueError("invalid ProtoDB envelope")
            seen.add(name)
            fields = list(wire(envelope[0]))
            cls = unique_text(fields,5)
            if not cls:
                raise ValueError("missing ProtoDB type")
            self.classes[cls] += 1
            self.count["protoEntries"] += 1
            if HINT.search(cls) or KEY_HINT.search(name) or re.search(r"shop|bundle|store",cls,re.I):
                self.proto_candidates.append({"source":source,"index":i,"name":name,
                    "nativeClass":cls,"envelopeSha256":sha(envelope[0])})

    def locale(self, raw, source, member, locale):
        table = locbin(raw)
        self.locale_members.append({"source":source,"member":member,"locale":locale,
                                    "entries":len(table),"sha256":sha(raw)})
        self.count["localizationEntries"] += len(table)
        for key, value in table.items():
            # No assumption that all titles are bundles; include unrecognized prefixes.
            if (member.casefold().endswith("liveops.locbin") and
                    key.casefold().endswith(("_title","_name","_displayname"))) or KEY_HINT.search(key) or HINT.search(key):
                self.title_keys[(member,key)][locale] = value

    def structured_bytes(self, raw, source):
        self.identifiers(raw, source)
        if raw.lstrip(b"\xef\xbb\xbf \t\r\n").startswith((b"{",b"[")):
            self.tree(json.loads(raw), source)
            self.count["structuredDocuments"] += 1

    def zip(self, path, rel):
        locale = LOCALES.get(path.stem.removeprefix("LocDB_"))
        with zipfile.ZipFile(path) as z:
            seen = set()
            for info in z.infolist():
                if info.is_dir():
                    continue
                try:
                    if info.filename in seen or info.file_size > MAX_STRUCTURED:
                        raise ValueError("duplicate or oversized member")
                    seen.add(info.filename)
                    data = z.read(info)
                    source = rel+"!"+info.filename
                    if locale and info.filename.endswith(".locbin"):
                        self.locale(data,rel,info.filename,locale)
                    else:
                        self.structured_bytes(data,source)
                    self.count["archiveMembers"] += 1
                except Exception as exc:
                    self.issue(rel+"!"+info.filename,"archive_member",exc)

    def unity(self, path, rel, UnityPy):
        env = UnityPy.load(str(path))
        self.count["unityFilesOpened"] += 1
        for obj in env.objects:
            kind = obj.type.name
            self.count["unityObjects:"+kind] += 1
            source = rel+"#"+str(obj.path_id)
            try:
                if kind in ("Sprite","Texture2D"):
                    # Read metadata only; never decompress pixel payload.
                    name = getattr(obj.read(),"m_Name","")
                    if HINT.search(rel) or HINT.search(name) or KEY_HINT.search(name):
                        self.art.append({"source":source,"class":kind,"name":name})
                elif kind == "TextAsset":
                    value = obj.read()
                    raw = value.m_Script
                    if isinstance(raw,str):
                        raw = raw.encode("utf-8",errors="surrogateescape")
                    self.structured_bytes(bytes(raw),source+":"+str(value.m_Name))
                elif kind in ("MonoBehaviour","ScriptableObject"):
                    self.tree(obj.read_typetree(),source)
                    self.count["unityTypedObjectsDecoded"] += 1
            except Exception as exc:
                self.issue(source,"unity_"+kind,exc)

    def addressables(self, directory, rel):
        # Enumerate ALL locations, not only GUIDs already known from caches.
        names=("catalog.json","catalog.keyData.bin","catalog.bucketData.bin",
               "catalog.entryData.bin","catalog.InternalIds.bin")
        raw={n:(directory/n).read_bytes() for n in names}
        d=json.loads(raw[names[0]])
        keys,buckets,entries=(raw[n] for n in names[1:4])
        ids=raw[names[4]].decode("utf-8-sig").splitlines()
        n=struct.unpack_from("<i",entries)[0]
        count=struct.unpack_from("<i",buckets)[0]
        if n<0 or len(entries)!=4+28*n or count<0 or count!=struct.unpack_from("<i",keys)[0]:
            raise ValueError("invalid catalog header")
        def entry(i):
            if not 0<=i<n:
                raise ValueError("invalid location index")
            row=struct.unpack_from("<7i",entries,4+28*i)
            if not 0<=row[0]<len(ids) or not 0<=row[6]<len(d["m_resourceTypes"]):
                raise ValueError("invalid location")
            return row
        groups=[]
        pos=4
        for _ in range(count):
            off,size=struct.unpack_from("<ii",buckets,pos)
            pos+=8
            if size<0 or not 4<=off<len(keys) or pos+4*size>len(buckets):
                raise ValueError("invalid bucket")
            group=struct.unpack_from("<"+str(size)+"i",buckets,pos)
            pos+=4*size
            groups.append((off,group))
        if pos!=len(buckets):
            raise ValueError("invalid bucket length")
        self.count["addressableLocations"]+=n
        for off,group in groups:
            key=None
            if keys[off]==0 and off+5<=len(keys):
                size=struct.unpack_from("<i",keys,off+1)[0]
                if 0<=size<=1024 and off+5+size<=len(keys):
                    key=keys[off+5:off+5+size].decode("ascii",errors="replace")
            for i in group:
                row=entry(i)
                path=ids[row[0]]
                deps=[]
                if row[2]!=-1:
                    if not 0<=row[2]<len(groups):
                        raise ValueError("invalid dependency")
                    deps=[ids[entry(j)[0]] for j in groups[row[2]][1]]
                if HINT.search(path) or (key and HINT.search(key)) or any(HINT.search(p) for p in deps):
                    self.art.append({"source":rel,"catalogKey":key,"internalId":path,
                        "class":d["m_resourceTypes"][row[6]]["m_ClassName"],"dependencies":deps})

    def report(self):
        titles=[{"member":m,"key":k,"names":v,
                 "shopKeyCandidate":bool(KEY_HINT.search(k) or HINT.search(k))}
                for (m,k),v in sorted(self.title_keys.items())]
        return {"schema":"wand.media.private-shop-source-census@1",
                "privateOnly":True,"publicationAuthorized":False,
                "historicalCoverageComplete":False,"serverCatalogQueried":False,
                "counts":dict(self.count),"sourceFiles":self.files,
                "pathCandidates":self.paths,"localeMembers":self.locale_members,
                "localizationCandidates":titles,
                "protoClassCounts":dict(self.classes),"protoCandidates":self.proto_candidates,
                "structuredOfferCandidates":self.structured,
                "assetCandidates":self.art,"rawIdentifierCandidates":
                    {k:sorted(v) for k,v in sorted(self.raw_ids.items())},
                "errors":self.errors,
                "limits":["No pixel decoding; opaque binary strings are candidates, not structural evidence.",
                          "Unparsed formats/typetrees remain errors or raw-only coverage.",
                          "No server response or sale history inferred."]}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--game",type=Path,default=Path(r"C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley"))
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    game=a.game.resolve(strict=True)
    out=a.out.resolve()
    if not game.is_dir() or not (game/"ddv_Data"/"StreamingAssets").is_dir():
        raise ValueError("Select the installed Steam game root")
    if out.exists() or game in out.parents or any((x/".git").exists() for x in out.parents):
        raise ValueError("Use a new private output outside installation and Git")
    import UnityPy
    c=Census()
    def walk_error(exc):
        c.issue("game","directory_enumeration",exc)
    for folder, dirs, files in os.walk(game,followlinks=False,onerror=walk_error):
        root=Path(folder)
        dirs[:]=sorted(x for x in dirs if not (root/x).is_symlink()
                      and not getattr(root/x,"is_junction",lambda:False)())
        for name in sorted(files):
            path=root/name
            rel=path.relative_to(game).as_posix()
            if path.is_symlink():
                c.count["skippedSymlinks"]+=1
                continue
            try:
                size=path.stat().st_size
                c.count["files"]+=1
                c.count["bytes"]+=size
                if HINT.search(rel) or KEY_HINT.search(name):
                    c.paths.append(rel)
                h=hashlib.sha256()
                is_unity=path.suffix.lower() in (".bundle",".assets",".unity3d") or name.lower()=="globalgamemanagers"
                with path.open("rb") as f:
                    tail=b""
                    while block:=f.read(BLOCK):
                        h.update(block)
                        # Compressed Unity payload is covered via serialized objects below.
                        if not is_unity:
                            c.identifiers(tail+block,rel)
                            tail=(tail+block)[-512:]
                c.files.append({"path":rel,"bytes":size,"sha256":h.hexdigest()})
                if name=="catalog.json" and (root/"catalog.keyData.bin").is_file():
                    c.addressables(root,rel)
                if is_unity:
                    c.unity(path,rel,UnityPy)
                elif path.suffix.lower()==".zip":
                    c.zip(path,rel)
                elif name.lower()=="protodb.bin":
                    c.proto(path.read_bytes(),rel)
                elif path.suffix.lower()==".json":
                    if size>MAX_STRUCTURED:
                        raise ValueError("JSON size limit")
                    c.tree(json.loads(path.read_bytes()),rel)
                    c.count["structuredDocuments"]+=1
                else:
                    c.count["rawOnlyFiles"]+=1
            except Exception as exc:
                c.issue(rel,"file",exc)
            if c.count["files"]%250==0:
                print("Files:",c.count["files"],"errors:",len(c.errors),flush=True)
    report=c.report()
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("x",encoding="utf-8") as f:
        json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({"files":c.count["files"],"localizationCandidates":len(c.title_keys),
        "protoEntries":c.count["protoEntries"],"structuredCandidates":len(c.structured),
        "artCandidates":len(c.art),"errors":len(c.errors),"report":str(out)},ensure_ascii=False))


if __name__=="__main__":
    main()
