"""Check texture application without claiming actual GPU or shader parity."""
import argparse,io
from pathlib import Path
from PIL import Image
from pose_textured import parse_glb
from pose_curves import require

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pairs',type=Path,required=True);p.add_argument('--textured',type=Path,required=True);a=p.parse_args();n=count=0
    for path in sorted(a.textured.glob('*.glb')):
        source=parse_glb((a.pairs/(path.stem+'-pair.glb')).read_bytes());result=parse_glb(path.read_bytes())
        require(all(source.doc[k]==result.doc[k] for k in ('animations','nodes','skins')),'animation or skeleton changed')
        require(result.bin[:len(source.bin)]==source.bin,'original data changed')
        for im in result.doc['images'][len(source.doc.get('images',[])):]:
            v=result.doc['bufferViews'][im['bufferView']];Image.open(io.BytesIO(bytes(result.bin[v['byteOffset']:v['byteOffset']+v['byteLength']]))).verify();n+=1
        count+=1
    require(count>0 and n>0,'no textured scenes');print('validated textured scenes',count,'new PNG images',n)
if __name__=='__main__':main()
