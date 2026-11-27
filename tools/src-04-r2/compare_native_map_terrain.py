#!/usr/bin/env python3
"""Render private terrain-vs-artwork comparisons; no registration fitting."""
import argparse
import base64
import hashlib
import json
import re
import zlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

COLORS = [(0,0,0,0),(255,193,42,90),(25,233,250,135),(255,255,255,160)]


def decode(mask):
    w,h=mask['width'],mask['height']
    if mask['encoding']!='zlib-u8-center-sampled-y-major' or not (type(w)==type(h)==int and 1<=w<=4096 and 1<=h<=4096):
        raise ValueError('Unexpected diagnostic mask')
    d=zlib.decompressobj()
    raw=d.decompress(base64.b64decode(mask['data'],validate=True),w*h+1)
    if len(raw)!=w*h or not d.eof or d.unused_data or d.unconsumed_tail or any(v>3 for v in raw) or hashlib.sha256(raw).hexdigest()!=mask['sha256']:
        raise ValueError('Mask integrity failure')
    return Image.frombytes('L',(w,h),raw)


def compare(image,mask):
    image=image.convert('RGBA')
    bg=Image.new('RGBA',image.size,(22,26,34,255))
    bg.alpha_composite(image)
    palette=Image.new('P',(4,1))
    palette.putpalette([c for color in COLORS for c in color[:3]]+[0]*756)
    rgba=mask.resize(image.size,Image.Resampling.NEAREST).convert('P')
    rgba.putpalette(palette.getpalette())
    rgba.info['transparency']=bytes(c[3] for c in COLORS)
    overlay=rgba.convert('RGBA')
    annotated=Image.alpha_composite(bg,overlay)
    panel=Image.new('RGB',(image.width*2,image.height+64),(22,26,34))
    panel.paste(bg.convert('RGB'),(0,64))
    panel.paste(annotated.convert('RGB'),(image.width,64))
    draw=ImageDraw.Draw(panel)
    try:font=ImageFont.truetype('DejaVuSans.ttf',19)
    except OSError:font=ImageFont.load_default()
    draw.text((18,12),'Original-texture background (source candidate)',font=font,fill='white')
    draw.text((image.width+18,12),'Terrain flags: amber = other; cyan = water; white = overlap',font=font,fill='white')
    draw.text((image.width+18,36),f'{mask.width} x {mask.height} samples; not placement or runtime verification',font=font,fill='#cccccc')
    return panel


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--audit',type=Path,required=True)
    p.add_argument('--preview-dir',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    if out.exists() or any((d/'.git').exists() for d in out.parents):
        raise ValueError('New private output outside Git required')
    doc=json.loads(a.audit.read_bytes())
    if doc['schema']!='wand.src04.native-map-terrain-extent-audit@1' or doc['privateOnly'] is not True or doc['publicationAuthorized'] is not False or doc['worldPlacementVerified'] is not False:
        raise ValueError('Expected private candidate audit')
    receipt=json.loads((a.preview_dir/'report.json').read_bytes())
    # Support the earlier local report list and the current EGL CLI report.
    if isinstance(receipt,dict):
        if receipt['privateOnly'] is not True or receipt['publicationAuthorized'] is not False or receipt['unityFrameVerified'] is not False:
            raise ValueError('Unexpected preview provenance')
        receipt=receipt['maps']
    frames={m['world']:m for m in receipt}
    out.mkdir()
    rows=[]
    for m in doc['maps']:
        name=m['prefab']
        if not re.fullmatch(r'MapVillage[A-Za-z0-9]+',name):
            raise ValueError('Invalid prefab identity')
        with Image.open(a.preview_dir/(name+'-unlocked.png')) as src:
            image=src.convert('RGBA')
        frame=frames[name]
        digest=hashlib.sha256(image.tobytes()).hexdigest()
        if list(image.size)!=frame['size'] or digest!=frame['states']['unlocked']['rgbaSha256']:
            raise ValueError('Preview receipt mismatch')
        w,h=m['width'],m['height']
        scale=max(image.size)/max(w,h)
        if abs(image.width-w*scale)>.51 or abs(image.height-h*scale)>.51:
            raise ValueError('Preview aspect mismatch')
        mask=decode(m['diagnosticMask'])
        if abs(mask.width-w*max(mask.size)/max(w,h))>.51 or abs(mask.height-h*max(mask.size)/max(w,h))>.51:
            raise ValueError('Diagnostic mask aspect mismatch')
        panel=compare(image,mask)
        path=out/(name+'-comparison.png')
        panel.save(path)
        rows.append({'prefab':name,'sourceFrameSha256':digest,'maskSha256':m['diagnosticMask']['sha256'],'comparisonSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    (out/'report.json').write_text(json.dumps({'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'comparisons':rows},indent=2))
    print(len(rows),'private comparison images')

if __name__=='__main__':main()
