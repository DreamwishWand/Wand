#!/usr/bin/env python3
"""Create a public original-only UI index after complete CDN byte verification."""
import argparse
import hashlib
import json
from pathlib import Path
from shared_source_delta import prepare
from source_image_ledger import load, published
from bundle_thumbnails import write_json
from publish_bundle_thumbnails import BUCKET, check

def project(evidence, index, receipt_raw, cdn):
    receipt=json.loads(receipt_raw)
    check(evidence["schema"]=="wand.media.private-ui-original-evidence@1" and
          evidence["privateOnly"] is True and evidence["publicationAuthorized"] is False and
          evidence["gameVersion"]==index["gameVersion"]==receipt["gameVersion"],"UI evidence mismatch")
    check(receipt["schema"]=="wand.media.shared-image-publication-receipt@1" and
          receipt["bucket"]==BUCKET and receipt["canonicalMetadataVerified"] is True and
          cdn["schema"]=="wand.media.cdn-readback@1" and
          cdn["origin"]=="https://media.dreamwishwand.com/" and cdn["cdnVerified"] is True and not cdn["errors"] and
          cdn["sourceReceiptSha256"]==hashlib.sha256(receipt_raw).hexdigest(),"Verified CDN receipt required")
    expected={"images/"+sha+".webp":m["bytes"] for sha,m in index["images"].items()}
    check(expected==receipt["objects"]==cdn["verified"],"Receipt coverage mismatch")
    check(set(evidence["assets"])==set(index["references"]) and evidence["images"]==index["images"],"UI reference coverage mismatch")
    entries={}
    for guid,row in sorted(evidence["assets"].items()):
        ref=index["references"][guid]
        sha=row["original"]
        check(ref=={"role":"ui-original","original":sha} and row["kind"]=="Texture2D","Original UI only")
        check(isinstance(row["name"],str) and 0<len(row["name"])<=256,"Invalid original name")
        image=index["images"][sha]
        kinds=["Texture2D"]+ (["Sprite"] if row.get("fullSpriteRectMatched") is True else [])
        for kind in kinds:
            m={"kind":kind,**image}
            rows=entries.setdefault(row["name"],[])
            if m not in rows:rows.append(m)
    return {"schema":"wand.shared-media-index@1","gameVersion":index["gameVersion"],"group":"ui","entries":entries}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    root=a.root.resolve()
    ledger=load(json.loads(a.ledger.read_bytes()))
    _,index,_,objects=prepare(root,ledger)
    check(all(published(ledger,m) for m in objects.values()),"Verified ledger coverage required")
    doc=project(json.loads((root/"ui-source-evidence.json").read_bytes()),index,
                (root/"shared-publication-receipt.json").read_bytes(),json.loads((root/"shared-cdn-readback.json").read_bytes()))
    check(not a.out.exists(),"New output file required")
    write_json(a.out,{"state":"published","publicationAuthorized":True,"publicReadbackVerified":True,"index":doc})
    print(len(doc["entries"]),"UI names; original only; no network requests")

if __name__=="__main__":main()
