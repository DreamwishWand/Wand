"""Split a private diagnostic GLB into a shared model and lossless per-clip payloads."""
import argparse, copy, json, struct
from pathlib import Path
from pose_glb import Glb
from pose_textured import parse_glb
from pose_curves import require
from resolve_animation_bundle import digest


def subset(source, doc, references, image_refs=()):
    g=Glb();g.doc=doc;doc['buffers']=[{}];doc['accessors']=[];doc['bufferViews']=[]
    views={};accessors={}
    def view(i):
        if i not in views:
            v=copy.deepcopy(source.doc['bufferViews'][i]);require(v['buffer']==0,'external buffer');start=v.get('byteOffset',0);end=start+v['byteLength'];require(0<=start<=end<=len(source.bin),'invalid buffer range')
            g.bin.extend(b'\0'*((-len(g.bin))%4));v['byteOffset']=len(g.bin);g.bin.extend(source.bin[start:end]);views[i]=len(doc['bufferViews']);doc['bufferViews'].append(v)
        return views[i]
    for obj,key in references:
        i=obj[key]
        if i not in accessors:
            a=copy.deepcopy(source.doc['accessors'][i]);require('sparse' not in a,'unsupported sparse accessor');a['bufferView']=view(a['bufferView']);accessors[i]=len(doc['accessors']);doc['accessors'].append(a)
        obj[key]=accessors[i]
    for image in image_refs:
        require('uri' not in image,'external image');image['bufferView']=view(image['bufferView'])
    return g


def split(raw):
    source=parse_glb(raw);d=source.doc;model=copy.deepcopy(d);animations=model.pop('animations');refs=[]
    for mesh in model['meshes']:
        for p in mesh['primitives']:
            refs.extend((p['attributes'],k) for k in p['attributes']);refs.append((p,'indices'))
            for target in p.get('targets',[]):refs.extend((target,k) for k in target)
    refs.extend((s,'inverseBindMatrices') for s in model['skins'])
    model['asset']['extras']['splitDiagnostic']=True
    base=subset(source,model,refs,model.get('images',[])).bytes();model_hash=digest(base);clips=[]
    for animation in animations:
        a=copy.deepcopy(animation);refs=[(s,k) for s in a['samplers'] for k in ('input','output')];doc={'schema':'wand.private-pose-clip@1','privateOnly':True,'publicationAuthorized':False,'modelSha256':model_hash,'animation':a};g=subset(source,doc,refs)
        doc['buffers'][0]['byteLength']=len(g.bin);js=json.dumps(doc,separators=(',',':'),allow_nan=False).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<4sII',b'WPA1',len(js),len(g.bin))+js+g.bin
        clips.append((a['extras']['sourceSha256'],payload,a['name']))
    require(len({x[0] for x in clips})==len(clips),'duplicate source clips')
    return base,clips


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--glb',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');raw=a.glb.read_bytes();base,clips=split(raw);out.mkdir(parents=True,exist_ok=False)
    model_hash=digest(base);(out/(model_hash+'.glb')).write_bytes(base);rows=[]
    for source,payload,name in clips:
        sha=digest(payload);(out/(sha+'.wpa')).write_bytes(payload);rows.append(dict(sourceSha256=source,sha256=sha,bytes=len(payload),name=name))
    manifest=dict(schema='wand.private-pose-package@1',privateOnly=True,publicationAuthorized=False,fullPoseVerified=False,model=dict(sha256=model_hash,bytes=len(base)),clips=rows,sourceGlbSha256=digest(raw));(out/'index.json').write_text(json.dumps(manifest,separators=(',',':'),allow_nan=False));print('original',len(raw),'model',len(base),'clips',len(rows),'min',min(x['bytes'] for x in rows),'max',max(x['bytes'] for x in rows),'total',len(base)+sum(x['bytes'] for x in rows))
if __name__=='__main__':main()
