#!/usr/bin/env python3
"""One-time CDN readback of R2-verified memory or Story images.
No credentials, writes, cache busting or unbounded retries.
"""
import argparse
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler

ORIGIN="https://media.dreamwishwand.com/"
USER_AGENT="DreamwishWand-MediaVerifier/1.0 (+https://dreamwishwand.com)"
KEY=re.compile(r"images/[a-f0-9]{64}\.webp")
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None

def check(ok,reason):
    if not ok:
        raise ValueError(reason)

def readback(entry):
    key,size=entry
    opener=build_opener(NoRedirect())
    request=Request(ORIGIN+key,headers={"Accept":"image/webp","Accept-Encoding":"identity","User-Agent":USER_AGENT})
    try:
        with opener.open(request,timeout=30) as response:
            check(response.status==200,"HTTP status")
            check(response.headers.get_content_type()=="image/webp","Content-Type")
            check(response.headers.get("Cache-Control")=="public, max-age=31536000, immutable","Cache-Control")
            raw=response.read(size+1)
            check(len(raw)==size,"Byte length")
            check(hashlib.sha256(raw).hexdigest()==key[7:-5],"SHA-256")
        return key,size,None
    except Exception as exc:
        return key,size,type(exc).__name__+": "+str(exc)[:200]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--receipt",type=Path,required=True)
    a=p.parse_args()
    path=a.receipt.resolve()
    doc=json.loads(path.read_bytes())
    check(doc.get("schema") in ("wand.media.story-puzzle-publication-receipt@1","wand.media.memory-publication-receipt@1") and doc.get("bucket")=="dreamwishwand-media" and doc.get("canonicalMetadataVerified") is True,"Unverified R2 receipt")
    objects=doc["objects"]
    check(isinstance(objects,dict) and 0<len(objects)<=576 and all(KEY.fullmatch(k) and type(v) is int and v>0 for k,v in objects.items()) and sum(objects.values())<=500000000,"Readback budget exceeded")
    print(f"One GET per image: {len(objects)} requests, {sum(objects.values())} bytes maximum expected image data. No R2 writes.",flush=True)
    if input("Type VERIFY to check public CDN: ")!="VERIFY":
        return
    verified={}
    errors={}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for n,(k,size,error) in enumerate(pool.map(readback,sorted(objects.items())),1):
            if error:
                errors[k]=error
            else:
                verified[k]=size
            if n%25==0 or n==len(objects):
                print(f"  CDN readback {n}/{len(objects)}; errors {len(errors)}",flush=True)
    result={"schema":"wand.media.cdn-readback@1","origin":ORIGIN,"sourceReceiptSha256":hashlib.sha256(path.read_bytes()).hexdigest(),"cdnVerified":not errors and verified==objects,"verified":verified,"errors":errors}
    dest=path.with_name(path.stem.replace("publication-receipt","cdn-readback")+".json")
    dest.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(f"Report: {dest}",flush=True)
    if not result["cdnVerified"]:
        raise SystemExit(2)

if __name__=="__main__":
    main()
