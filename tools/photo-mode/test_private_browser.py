"""Run local Chromium on private, operator-supplied diagnostic GLBs without a web server."""
import argparse,base64,subprocess,tempfile
from io import BytesIO
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--male',type=Path,required=True);p.add_argument('--female',type=Path,required=True);p.add_argument('--chromium',type=Path);a=p.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        source=Path(__file__).with_name('cpu-diagnostic.ts')
        subprocess.run(['tsc','--strict','--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--outDir',temp,str(source)],check=True)
        script=(Path(temp)/'cpu-diagnostic.js').read_text().replace('export class CpuPoseDiagnostic','class CpuPoseDiagnostic')+'\nwindow.CpuPoseDiagnostic=CpuPoseDiagnostic;'
        with sync_playwright() as pw:
            options={'executable_path':str(a.chromium)} if a.chromium else {}
            browser=pw.chromium.launch(**options);page=browser.new_page();page.set_content('<canvas width="400" height="400"></canvas>');page.add_script_tag(content=script)
            for sex in ('male','female'):
                raw=base64.b64encode(getattr(a,sex).read_bytes()).decode()
                durations=page.evaluate('raw=>{window.pose=new CpuPoseDiagnostic(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)).buffer);return pose.durations}',raw)
                changed=0;minimum=400*400
                for i,t in enumerate(durations):
                    frames=[page.evaluate('([i,t])=>{pose.draw(document.querySelector("canvas"),i,t);return document.querySelector("canvas").toDataURL()}',[i,t*f]) for f in (.1,.5,.9)]
                    pixels=[np.array(Image.open(BytesIO(base64.b64decode(x.split(',')[1])))) for x in frames]
                    minimum=min(minimum,*(int((img[:,:,:3]!=img[0,0,:3]).any(2).sum()) for img in pixels));changed+=len(set(frames))>1
                print(sex,len(durations),'changed',changed,'min foreground pixels',minimum)
                if minimum<=0 or changed!=len(durations) or not durations:raise RuntimeError('empty or unchanged rendering')
            browser.close()
if __name__=='__main__':main()
