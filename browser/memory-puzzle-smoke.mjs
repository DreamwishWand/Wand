import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {memoryPreviewVertex,memoryPreviewFragment} from '../src/lib/media/memory-mask-preview.ts';
import {PUZZLE_MATERIALS} from '../src/lib/media/memory-puzzle-formula.ts';

const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();
  const result=await page.evaluate(({vertex,fragment,materials})=>{
    const canvas=document.createElement('canvas');canvas.width=4;canvas.height=1;
    const g=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
    if(!g)throw Error('WebGL2 unavailable');
    function compile(type,source){
      const shader=g.createShader(type);g.shaderSource(shader,source);g.compileShader(shader);
      if(!g.getShaderParameter(shader,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(shader));
      return shader;
    }
    const program=g.createProgram();
    g.attachShader(program,compile(g.VERTEX_SHADER,vertex));g.attachShader(program,compile(g.FRAGMENT_SHADER,fragment));
    g.linkProgram(program);
    if(!g.getProgramParameter(program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(program));
    g.useProgram(program);g.viewport(0,0,4,1);
    const images=[
      Array.from({length:4},()=>[200,100,50,255]).flat(),
      [1,0,0,255, 2,0,0,255, 0,2,0,255, 3,0,0,255],
      [255,255,255,255, 255,255,255,255, 255,255,255,255, 128,128,128,255]
    ];
    for(const [unit,bytes] of images.entries()){
      g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,g.createTexture());
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,4,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(bytes));
      g.uniform1i(g.getUniformLocation(program,['artwork','maskTex','outlineTex'][unit]),unit);
    }
    const i=(name,value)=>g.uniform1i(g.getUniformLocation(program,name),value);
    function draw(flags,material,invert=false){
      const p=materials[material];
      i('nativeFormula',1);i('artworkSlot0',0);i('completeBits',1023);i('selectedBits',flags);i('invertFlags',invert?1:0);
      g.uniform3fv(g.getUniformLocation(program,'materialTint'),p.tint);
      g.uniform1f(g.getUniformLocation(program,'materialAlpha'),p.alpha);
      i('materialAlphaClip',p.alphaClip?1:0);
      g.drawArrays(g.TRIANGLES,0,3);
      const pixels=new Uint8Array(16);g.readPixels(0,0,4,1,g.RGBA,g.UNSIGNED_BYTE,pixels);
      if(g.getError()!==g.NO_ERROR)throw Error('GPU operation failed');
      return Array.from({length:4},(_,j)=>Array.from(pixels.slice(4*j,4*j+3)));
    }
    return {first:draw(1,'mask'),green:draw(512,'mask'),inverted:draw(1022,'mask',true),show:draw(1,'show')};
  },{vertex:memoryPreviewVertex,fragment:memoryPreviewFragment,materials:PUZZLE_MATERIALS});
  const art=[200,100,50],black=[0,0,0];
  assert.deepEqual(result.first,[black,art,art,black]);
  assert.deepEqual(result.inverted,result.first);
  assert.deepEqual(result.green.slice(0,3),[art,art,black]);
  assert.ok(result.green[3].every((v,i)=>Math.abs(v-art[i]*128/255)<=1),'contour interpolation');
  assert.deepEqual(result.show,[art,art,art,art]);
  console.log('Memory Puzzle GPU smoke passed (synthetic textures; not game runtime parity)');
}finally{await browser.close();}
