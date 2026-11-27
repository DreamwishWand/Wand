"""Compile the development-only viewer into a new directory outside Git."""
import argparse, shutil, subprocess
from pathlib import Path
from pose_curves import require

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    here=Path(__file__).resolve().parent;out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only')
    out.mkdir(parents=True,exist_ok=False)
    for name in ('cpu-diagnostic.ts','split-loader.ts','preview.ts','index.html'):
        shutil.copyfile(here/name,out/name)
    shutil.copyfile(here.parent.parent/'src/lib/photo-mode/playback.ts',out/'playback.ts')
    (out/'package.json').write_text('{"type":"module"}\n')
    tsc=here.parent.parent/'node_modules/.bin/tsc'
    subprocess.run([str(tsc) if tsc.exists() else 'tsc','--strict','--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--outDir',str(out),*[str(p) for p in sorted(out.glob('*.ts'))]],check=True)
    print('Serve only on loopback:', 'python -m http.server 8765 --bind 127.0.0.1 --directory',out)
if __name__=='__main__':main()
