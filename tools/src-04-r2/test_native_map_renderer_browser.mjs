// Browser smoke test, synthetic textures only; no server or asset publication.
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from 'playwright';
const source=readFileSync(new URL('../../src/lib/media/native-map-renderer.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 await page.setContent('<canvas id="c" width="16" height="16"></canvas>');
 const result=await page.evaluate(async code=>{
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  try{
   const {NativeMapRenderer}=await import(url);
   const canvas=document.querySelector('#c'),r=new NativeMapRenderer(canvas),g=canvas.getContext('webgl2');
   const quad=[16,0,0,16,0,0],view={x:0,y:0,width:16,height:16};
   const red={kind:'fill',unitQuadToCanvas:quad,rgba:[1,0,0,1]},blue={kind:'fill',unitQuadToCanvas:quad,rgba:[0,0,1,.5]},skip={...red,unitQuadToCanvas:[1,0,0,1,100,100]};
   const read=(x,y)=>{const p=new Uint8Array(4);g.readPixels(x,y,1,1,g.RGBA,g.UNSIGNED_BYTE,p);return [...p];};
   const close=(got,expected,tolerance=1)=>{if(got.some((v,i)=>Math.abs(v-expected[i])>tolerance))throw Error(JSON.stringify({got,expected}));};
   try{
    const progress=[];
    const stats=await r.render([red,blue,skip],view,()=>{throw Error('unexpected source');},undefined,p=>progress.push(p));
    if(JSON.stringify(progress)!==JSON.stringify([{done:0,total:2},{done:1,total:2},{done:2,total:2}]))throw Error('visible layer progress');
    close(read(8,8),[128,0,128,191]);if(stats.drawn!==2||stats.skipped!==1)throw Error('culling');
    const t={kind:'sdf',unitQuadToCanvas:quad,rgba:[0,1,0,1],imageSha256:'a'.repeat(64),size:[2,2],wrap:[1,1],colorSpace:'Linear'};
    const pixels=new Uint8ClampedArray([0,0,0,255,255,0,0,255,0,0,0,255,255,0,0,255]);
    const source=()=>createImageBitmap(new ImageData(pixels,2,2),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
    let samples=0;
    for(const w of [16,32,64]){
     canvas.width=w;canvas.height=16;await r.render([red,t],view,source);
     for(let x=w*.3|0;x<w*.7;x++){
      const d=(x+.5)/w*2-.5+.05,f=.75*2/w+.1;
      let a=Math.max(0,Math.min(1,(d-.5+f)/(2*f)));a=a*a*(3-2*a);
      close(read(x,8),[Math.round(255*(1-a)),Math.round(255*a),0,Math.round(255*(a*a+1-a))],3);samples++;
     }
    }
    // Rect mask in source UV, and framebuffer copying with unchanged coordinates.
    canvas.width=16;canvas.height=16;
    const masked={...blue,rgba:[0,0,1,1],mask:{kind:'rect',overlayToMaskUv:[2,0,0,1,-.5,0]}};
    await r.render([red,masked],view,source);
    close(read(1,8),[255,0,0,255]);close(read(8,8),[0,0,255,255]);close(read(14,8),[255,0,0,255]);
    const output=document.createElement('canvas');output.width=16;output.height=16;
    const ctx=output.getContext('2d');ctx.drawImage(canvas,0,0);
    close([...ctx.getImageData(8,7,1,1).data],[0,0,255,255]);
    await r.render([red,masked],{x:4,y:0,width:8,height:16},source);
    close(read(8,8),[0,0,255,255]);
    return {blend:true,culling:true,progress:true,rectMask:true,canvasCopy:true,sdfSamples:samples};
   }finally{r.dispose();}
  }finally{URL.revokeObjectURL(url);}
 },js);
 console.log(result);
}finally{await browser.close();}
