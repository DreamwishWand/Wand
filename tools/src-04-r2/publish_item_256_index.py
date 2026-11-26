#!/usr/bin/env python3
"""Publish a receipt-verified 256px Item index. No image writes or deletes.
The default Steam 1.26.2 release remains exactly pinned; later releases require
an explicit version and reviewed manifest SHA for any R2 writes.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

BUCKET='dreamwishwand-media'
CACHE='public, max-age=31536000, immutable'
VERSION='steam-1.26.2'
SHA=re.compile(r'[a-f0-9]{64}')
EXPECTED_MANIFEST='cccc75bd916a3a5fed6ad7bcf45f95cbf38a178ea2614bfa9639fe352699d007'

def require(ok, msg):
    if not ok: raise ValueError(msg)

def pack(doc):
    return (json.dumps(doc, sort_keys=True, separators=(',',':'), ensure_ascii=True)+'\n').encode('ascii')

def pin(raw):
    return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}

def prepare(index, receipt, *, version=VERSION, expected_manifest=None):
    require(re.fullmatch(r'steam-\d+\.\d+\.\d+',version),'Invalid Steam version')
    baseline=version==VERSION
    if baseline:
        require(expected_manifest in (None,EXPECTED_MANIFEST),'Baseline manifest pin changed')
        expected_manifest=EXPECTED_MANIFEST
    elif expected_manifest is not None:
        require(SHA.fullmatch(expected_manifest),'Invalid manifest pin')
    require(index.get('schema')=='wand.media.item-index@256-v1' and index.get('gameVersion')==version.removeprefix('steam-') and index.get('thumbnailPolicy')=='lossless-webp-lanczos-256-v1' and index.get('maxThumbnailLongEdge')==256,'Unexpected index')
    require(receipt.get('schema')=='wand.media.item-256-publication-receipt@1' and receipt.get('bucket')==BUCKET and receipt.get('canonicalMetadataVerified') is True,'Missing verified receipt')
    images=index['images']; items=index['items']; expected={}; used=set(); buckets=[[] for _ in range(256)]
    require(isinstance(items,dict) and isinstance(images,dict) and len(items)>0 and len(images)>0,'Empty/invalid index')
    if baseline: require(len(items)==13202 and len(images)==14742,'Reviewed coverage changed')
    for sha,v in images.items():
        require(SHA.fullmatch(sha) and v['sha256']==sha and all(type(v.get(k)) is int and v[k]>0 for k in ('bytes','width','height')) and max(v['width'],v['height'])<=16384,'Invalid image metadata')
        expected['images/'+sha+'.webp']=v['bytes']
    require(receipt['objects']==expected,'Receipt/index mismatch')
    if baseline: require(sum(expected.values())==934459926,'Reviewed image bytes changed')
    for idstr,pair in items.items():
        i=int(idstr); require(str(i)==idstr and 0<i<=2**53-1 and isinstance(pair,list) and len(pair)==2,'Invalid Item ID/row')
        row={'id':i}
        for role,sha in zip(('original','thumbnail'),pair):
            v=images[sha];used.add(sha)
            row[role]={'key':'images/'+sha+'.webp','width':v['width'],'height':v['height']}
        o,t=(images[s] for s in pair)
        require(t['width']<=o['width'] and t['height']<=o['height'] and max(t['width'],t['height'])<=256 and (pair[0]==pair[1] if max(o['width'],o['height'])<=256 else max(t['width'],t['height'])==256),'Thumbnail policy mismatch')
        buckets[i%256].append(row)
    require(used==set(images),'Unreferenced image')
    payloads={};files={}
    for n,rows in enumerate(buckets):
        b=f'{n:02x}';name=f'id/{b}.json'
        raw=pack({'schema':'wand.media.distribution-shard@1','bucket':b,'items':sorted(rows,key=lambda r:r['id'])})
        payloads[name]=raw;files[name]={**pin(raw),'count':len(rows)}
    payloads['manifest.json']=pack({'schema':'wand.media.distribution@1','gameVersion':version,'releaseState':'published','bucketCount':256,'totalItems':len(items),'files':files,'cachePolicy':'immutable_content_addressed_media'})
    manifest=pin(payloads['manifest.json'])
    if expected_manifest is not None: require(manifest['sha256']==expected_manifest,'Reviewed manifest hash mismatch')
    return payloads,manifest

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--r2',action='store_true')
    p.add_argument('--version',default=VERSION,help='Explicit Steam version, e.g. steam-1.27.0')
    p.add_argument('--expected-manifest',help='SHA-256 from the reviewed offline index plan')
    p.add_argument('--max-index-bytes',type=int,default=5000000)
    a=p.parse_args()
    require(a.max_index_bytes>0,'Invalid index byte budget')
    require(not a.r2 or a.version==VERSION or a.expected_manifest is not None,'Future R2 publication requires the reviewed manifest SHA')
    root=a.root.resolve(); index=json.loads((root/'item-256-index-candidate.json').read_bytes()); receipt=json.loads((root/'item-256-publication-receipt.json').read_bytes())
    payloads,manifest=prepare(index,receipt,version=a.version,expected_manifest=a.expected_manifest)
    prefix=f'index/items/{a.version}/{manifest["sha256"]}/'
    plan={'manifest':manifest,'prefix':prefix,'totalItems':len(index['items']),'objects':len(payloads),'bytes':sum(map(len,payloads.values())),'maxClassA':len(payloads),'maxClassB':len(payloads),'imageWrites':0}
    print(json.dumps(plan,indent=2),flush=True)
    if not a.r2:return
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    account=os.environ.get('R2_ACCOUNT_ID','');require(re.fullmatch(r'[0-9a-f]{32}',account) and os.environ.get('AWS_ACCESS_KEY_ID') and os.environ.get('AWS_SECRET_ACCESS_KEY'),'R2 credentials required')
    s3=boto3.client('s3',region_name='auto',endpoint_url=f'https://{account}.r2.cloudflarestorage.com',config=Config(retries={'total_max_attempts':1},connect_timeout=10,read_timeout=30))
    require('IfNoneMatch' in s3.meta.service_model.operation_model('PutObject').input_shape.members,'Conditional PUT required')
    require(len(payloads)==257 and plan['bytes']<=a.max_index_bytes,'Index budget exceeded')
    if a.version==VERSION: require(plan['bytes']==3519375,'Reviewed index byte count changed')
    approval='UPLOAD INDEX' if a.version==VERSION else 'UPLOAD INDEX '+manifest['sha256']
    if input(f'Confirm remaining R2 free allowance. Type {approval}: ')!=approval:return
    # Manifest last; immutable conditional writes. Existing objects must match bytes.
    for n,(name,raw) in enumerate(payloads.items(),1):
        key=prefix+name
        try:
            s3.put_object(Bucket=BUCKET,Key=key,Body=raw,IfNoneMatch='*',ContentType='application/json',CacheControl=CACHE,StorageClass='STANDARD',Metadata={'sha256':pin(raw)['sha256']})
        except ClientError as e:
            if e.response.get('ResponseMetadata',{}).get('HTTPStatusCode')!=412:raise
        response=s3.get_object(Bucket=BUCKET,Key=key)
        with response['Body'] as body: actual=body.read(len(raw)+1)
        require(actual==raw and response.get('ContentType')=='application/json' and response.get('CacheControl')==CACHE,'Index readback mismatch: '+name)
        if n%32==0 or n==len(payloads):print(f'Index objects verified {n}/{len(payloads)}',flush=True)
    result={**plan,'schema':'wand.media.item-256-index-publication@1','bucket':BUCKET,'canonicalIndexReadbackVerified':True,'cdnVerified':False}
    dest=root/'item-256-index-publication-receipt.json';dest.write_bytes(pack(result));print(f'Return {dest}',flush=True)
if __name__=='__main__':main()
