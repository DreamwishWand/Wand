/** Synthetic browser smoke: actual Rust/WASM execution in isolated Save Worker. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {createCipheriv} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';

function syntheticEncryptedP1g(profile) {
  const json=Buffer.from(JSON.stringify(profile),'utf8');
  const compressed=deflateRawSync(json);
  const name=Buffer.from('profile');
  let crc=0xffffffff;
  for(const byte of json){
    crc^=byte;
    for(let i=0;i<8;i++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
  }
  crc=(crc^0xffffffff)>>>0;
  const local=Buffer.alloc(30+name.length+compressed.length);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(json.length,22);local.writeUInt16LE(name.length,26);
  name.copy(local,30);compressed.copy(local,30+name.length);
  const central=Buffer.alloc(46+name.length);
  central.writeUInt32LE(0x02014b50,0);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(json.length,24);central.writeUInt16LE(name.length,28);
  name.copy(central,46);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);
  eocd.writeUInt32LE(central.length,12);
  eocd.writeUInt32LE(local.length,16);
  const cipher=createCipheriv('aes-256-ecb',
    Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex'),null);
  return Buffer.concat([cipher.update(Buffer.concat([local,central,eocd])),cipher.final()]);
}


const url='http://127.0.0.1:4185/Wand/save/diagnostics/';
const server=spawn(process.execPath,[
  'node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4185'
],{env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'});
let output='';
server.stdout.on('data',x=>output+=String(x));
server.stderr.on('data',x=>output+=String(x));
async function ready(){
  for(let i=0;i<90;i++){
    try{if((await fetch(url)).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('DB05_WASM_PREVIEW_NOT_READY '+output);
}
let browser;
try{
  await ready();
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  const errors=[],loadedWasm=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{
    if(response.url().includes('.wasm'))loadedWasm.push({
      url:response.url(),status:response.status()
    });
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const freshSynthetic={
    GameInfo:{Version:643},
    Player:{ContainerInventories:{'31':{ID:31,Inventory:[]}}},
    World:{GridCollection:{
      Grids:{'0':{ID:0,Objects:{}}},
      DiffGrids:{}
    }}
  };
  const bytes=Buffer.from(JSON.stringify(freshSynthetic),'utf8');
  await page.locator('input[type=file]').setInputFiles({
    name:'synthetic.json',mimeType:'application/json',buffer:bytes
  });
  const status=page.locator('p[role="status"].notice');
  await page.getByText(/Rust\/WASMによる内部参照14規則の検査はJSと一致しました/).waitFor({timeout:25000});
  assert.match(await status.innerText(),/Rust\/WASMによる内部参照14規則/);
  assert.ok(loadedWasm.some(v=>v.status===200&&v.url.includes('ddv_save_schema_bg')),
    'Actual compiled Rust ddv_save_schema WASM must be fetched, not a JS mock');
  assert.equal(await page.getByRole('alert').count(),0);
  assert.deepEqual(errors,[],errors.join('\n'));
  await page.getByRole('button',{name:'読み込み内容を破棄'}).click();
  // Genuine Steam snapshots also use the .profile extension for raw JSON.
  await page.locator('input[type=file]').setInputFiles({
    name:'plaintext.profile',mimeType:'application/octet-stream',buffer:bytes
  });
  await page.getByText(/JSONを専用Worker内で検査しました/).waitFor({timeout:25000});
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'読み込み内容を破棄'}).click();
  await page.locator('input[type=file]').setInputFiles({
    name:'synthetic.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(freshSynthetic)
  });
  await page.getByText(/Rust\/WASMでP1Gを独立復号し、元のJSONバイト列との一致を確認しました/).waitFor({timeout:30000});
  assert.ok(loadedWasm.some(v=>v.status===200&&v.url.includes('ddv_p1g_codec_bg')),
    'Actual Rust P1G WASM must load inside the Save Worker');
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'読み込み内容を破棄'}).click();
  const duplicate='{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}';
  await page.locator('input[type=file]').setInputFiles({
    name:'duplicate.json',mimeType:'application/json',
    buffer:Buffer.from(duplicate,'utf8')
  });
  await page.getByRole('alert').filter({hasText:'診断できません'}).waitFor({timeout:15000});
  assert.equal(await page.getByText(/Rust\/WASMによる内部参照14規則/).count(),0,
    'Strict input errors must stop before the Rust/WASM result is shown');
  // Inventory/Chest change *without* export, using real Rust/WASM inside a
  // dedicated one-shot preview Worker. Both plaintext .profile and AES P1G.
  const quantityProfile={
    GameInfo:{Version:643},
    Player:{
      ListInventories:{'100':{Inventory:{'550':{Amount:7,UnknownRatio:1.00}}}},
      ContainerInventories:{'202':{Inventory:[
        {ItemID:0,Amount:0},{ItemID:440,Amount:2,Extra:null}
      ]}}
    },
    World:{}
  };
  await page.goto('http://127.0.0.1:4185/Wand/save/preview/',{
    waitUntil:'domcontentloaded'
  });
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'plaintext.profile',mimeType:'application/octet-stream',
    buffer:Buffer.from(JSON.stringify(quantityProfile))
  });
  await page.getByRole('button',{name:'変更を検証'}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);

  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'encrypted.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'変更を検証'}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);

  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('対象の種類').selectOption('chest');
  await page.getByLabel('現在の数量').fill('2');
  await page.getByLabel('変更後の数量').fill('3');
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'encrypted.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'変更を検証'}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);

  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('現在の数量').fill('99');
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'encrypted.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'変更を検証'}).click();
  await page.getByRole('alert').filter({hasText:'検証できませんでした'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('status').count(),0);

  assert.deepEqual(errors,[],errors.join('\n'));
  await page.close();
  console.log('DB-05 browser: auto plaintext/P1G, Rust/WASM quantity preview/repack and reject stale expected amount PASS');
}finally{
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
