/** Synthetic browser smoke: actual Rust/WASM execution in isolated Save Worker. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {createCipheriv,createDecipheriv} from 'node:crypto';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';

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


function readSyntheticEncryptedP1g(ciphertext) {
  const key=Buffer.from('62357168683873614A38556C444A557A545A5864325467366D626F3857386e35','hex');
  const decoder=createDecipheriv('aes-256-ecb',key,null);
  const zip=Buffer.concat([decoder.update(ciphertext),decoder.final()]);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  const compressed=zip.readUInt32LE(18);
  const start=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
  const data=zip.subarray(start,start+compressed);
  const decoded=zip.readUInt16LE(8)===8?inflateRawSync(data):data;
  assert.equal(decoded.length,zip.readUInt32LE(22));
  return JSON.parse(decoded.toString('utf8'));
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
  const page=await browser.newPage({viewport:{width:1100,height:850},acceptDownloads:true});
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
  await page.locator('.save-diagnostics-page input[type=file]').setInputFiles({
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
  await page.locator('.save-diagnostics-page input[type=file]').setInputFiles({
    name:'plaintext.profile',mimeType:'application/octet-stream',buffer:bytes
  });
  await page.getByText(/JSONを専用Worker内で検査しました/).waitFor({timeout:25000});
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'読み込み内容を破棄'}).click();
  await page.locator('.save-diagnostics-page input[type=file]').setInputFiles({
    name:'synthetic.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(freshSynthetic)
  });
  await page.getByText(/Rust\/WASMでP1Gを再復号し、Worker内のJSONバイト列との一致を確認しました/).waitFor({timeout:30000});
  assert.ok(loadedWasm.some(v=>v.status===200&&v.url.includes('ddv_p1g_codec_bg')),
    'Actual Rust P1G WASM must load inside the Save Worker');
  assert.equal(await page.getByRole('alert').count(),0);
  await page.getByRole('button',{name:'読み込み内容を破棄'}).click();
  const duplicate='{"GameInfo":{"Version":643},"Player":{"x":1,"x":2},"World":{}}';
  await page.locator('.save-diagnostics-page input[type=file]').setInputFiles({
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
      ListInventories:{'100':{Inventory:{
        '550':{Amount:7,UnknownRatio:1.00},
        '777':{Amount:1,ExclusiveDecor:true,Unrelated:3.50},
        '30000031':{Amount:1,Db01Sample:true}
      }}},
      ContainerInventories:{'202':{Inventory:[
        {ItemID:0,Amount:0},{ItemID:440,Amount:2,Extra:null}
      ]}}
    },
    World:{
      MissionSlots:{'synthetic-private-group':{Slots:[
        {MissionId:2070000620,PrivateProgress:'do-not-export'},
        {MissionId:8765432101},{MissionId:0},{FutureField:true}
      ]}},
      GridCollection:{
      Grids:{'101':{ID:101,
        GridDefaultLayoutPath:'SceneLayouts/Synthetic/Grid.json',
        GridDataPath:'GridData/Synthetic/Grid.json',Objects:{
        '1':{ID:1,ItemID:40000001,X:45,Y:9,
          Orientation:'GridOrientation_Up',PrivateState:'do-not-export'},
        '2':{ID:2,ItemID:30000031}
      }}},
      DiffGrids:{'102':{ID:102,
        GridDefaultLayoutPath:'SceneLayouts/Synthetic/Grid.json',
        GridDefaultLayoutType:'Meta.GridCollection, Meta',
        DefaultLayoutGridID:7,DefaultGridHashCode:31,
        DefaultGridDataHashCode:-12,
        RemovedObjects:[5],ModifiedObjects:{
        '5':{ID:5,ItemID:40000001},
        '6':{ID:6,ItemID:40000001,X:-12,Y:8,Orientation:'GridOrientation_Left'}
      }}}
    }}
  };
  // The Home header transfers its File session to Save Preview without
  // reselecting the original. The existing Rust/WASM slot Worker runs on entry.
  await page.goto('http://127.0.0.1:4185/Wand/',{waitUntil:'domcontentloaded'});
  await page.locator('input[aria-hidden="true"][accept*=".profile"]').setInputFiles({
    name:'shared-preview.profile',mimeType:'application/octet-stream',
    buffer:Buffer.from(JSON.stringify(quantityProfile))
  });
  await page.getByRole('button',{name:'セーブファイル管理'}).click();
  await page.getByRole('button',{name:'編集プレビューを開く（開発用）'}).click();
  await page.waitForURL('**/save/preview/');
  await page.locator('.active-save-file').getByText('shared-preview.profile').waitFor();
  const sharedSlotCount=page.locator('.slot-actions [role="status"]').filter({hasText:'件'}).first();
  await sharedSlotCount.waitFor({timeout:30000});
  assert.match(await sharedSlotCount.innerText(),/件/);
  assert.equal(await page.getByRole('alert').count(),0);

  await page.goto('http://127.0.0.1:4185/Wand/save/preview/',{
    waitUntil:'domcontentloaded'
  });
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'plaintext.profile',mimeType:'application/octet-stream',
    buffer:Buffer.from(JSON.stringify(quantityProfile))
  });
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'編集済みコピーを生成'}).click();
  const plainLink=page.getByRole('link',{name:'コピーをダウンロード'});
  await plainLink.waitFor({timeout:30000});
  const plainDownloadPromise=page.waitForEvent('download');
  await plainLink.click();
  const plainDownload=await plainDownloadPromise;
  assert.match(plainDownload.suggestedFilename(),/\.wand-edited\.profile$/);
  const savedPlain=JSON.parse((await readFile(await plainDownload.path())).toString('utf8'));
  assert.equal(savedPlain.Player.ListInventories['100'].Inventory['550'].Amount,12);
  assert.equal(quantityProfile.Player.ListInventories['100'].Inventory['550'].Amount,7,
    'The original input is never overwritten');
  assert.equal(savedPlain.Player.ListInventories['100'].Inventory['550'].UnknownRatio,1);

  // Product requirement: even a one-owned decorative item can be increased
  // above normal gameplay ownership/stack limits. This tests saved Amount
  // only, NOT the game's actual placement engine.
  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('Item ID').fill('777');
  await page.getByLabel('現在の数量').fill('1');
  await page.getByLabel('変更後の数量').fill('250');
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'single-owned-decor.profile',mimeType:'application/octet-stream',
    buffer:Buffer.from(JSON.stringify(quantityProfile))
  });
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'編集済みコピーを生成'}).click();
  const overcapLink=page.getByRole('link',{name:'コピーをダウンロード'});
  await overcapLink.waitFor({timeout:30000});
  const overcapDownloadEvent=page.waitForEvent('download');
  await overcapLink.click();
  const overcapCopy=JSON.parse(
    (await readFile(await (await overcapDownloadEvent).path())).toString('utf8')
  );
  assert.equal(overcapCopy.Player.ListInventories['100'].Inventory['777'].Amount,250);
  assert.equal(overcapCopy.Player.ListInventories['100'].Inventory['777'].ExclusiveDecor,true);
  assert.equal(quantityProfile.Player.ListInventories['100'].Inventory['777'].Amount,1);
  assert.equal(overcapCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);

  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('Item ID').fill('550');
  await page.getByLabel('現在の数量').fill('7');
  await page.getByLabel('変更後の数量').fill('12');
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'encrypted.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
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
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'編集済みコピーを生成'}).click();
  const encryptedLink=page.getByRole('link',{name:'コピーをダウンロード'});
  await encryptedLink.waitFor({timeout:30000});
  const encryptedDownloadPromise=page.waitForEvent('download');
  await encryptedLink.click();
  const encryptedDownload=await encryptedDownloadPromise;
  const savedEncrypted=await readFile(await encryptedDownload.path());
  const reopened=readSyntheticEncryptedP1g(savedEncrypted);
  assert.equal(reopened.Player.ContainerInventories['202'].Inventory[1].Amount,3);
  assert.equal(reopened.Player.ContainerInventories['202'].Inventory[1].ItemID,440);
  assert.equal(quantityProfile.Player.ContainerInventories['202'].Inventory[1].Amount,2);
  assert.equal(reopened.Player.ListInventories['100'].Inventory['550'].Amount,7);

  // Batch combines two Inventory edits and one Chest edit in a single copy.
  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('対象の種類').selectOption('inventory');
  await page.getByLabel('Item ID').fill('777');
  await page.getByLabel('現在の数量').fill('1');
  await page.getByLabel('変更後の数量').fill('250');
  await page.getByRole('button',{name:'複数編集に追加'}).click();
  await page.getByLabel('Item ID').fill('550');
  await page.getByLabel('現在の数量').fill('7');
  await page.getByLabel('変更後の数量').fill('31968');
  await page.getByRole('button',{name:'複数編集に追加'}).click();
  await page.getByLabel('対象の種類').selectOption('chest');
  await page.getByLabel('現在の数量').fill('2');
  await page.getByLabel('変更後の数量').fill('888');
  await page.getByRole('button',{name:'複数編集に追加'}).click();
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'batch.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'一括変更を検証'}).click();
  await page.getByRole('status').filter({hasText:'3件の一括変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'編集済みコピーを生成'}).click();
  const batchLink=page.getByRole('link',{name:'コピーをダウンロード'});
  await batchLink.waitFor({timeout:30000});
  const batchEvent=page.waitForEvent('download');
  await batchLink.click();
  const batchOpened=readSyntheticEncryptedP1g(
    await readFile(await (await batchEvent).path())
  );
  assert.equal(batchOpened.Player.ListInventories['100'].Inventory['777'].Amount,250);
  assert.equal(batchOpened.Player.ListInventories['100'].Inventory['550'].Amount,31968);
  assert.equal(batchOpened.Player.ContainerInventories['202'].Inventory[1].Amount,888);
  assert.equal(batchOpened.Player.ContainerInventories['202'].Inventory[1].ItemID,440);
  assert.equal(batchOpened.Player.ListInventories['100'].Inventory['777'].ExclusiveDecor,true);
  assert.equal(batchOpened.Player.ContainerInventories['202'].Inventory[1].Extra,null);
  assert.equal(quantityProfile.Player.ListInventories['100'].Inventory['777'].Amount,1);

  // An edit queue may be prepared before the first file selection (tested
  // above), but changing an already-selected Save must discard that queue
  // and any previously generated edited-copy link.
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'another-save.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  assert.equal(await page.getByRole('region',{name:'一括数量変更'}).count(),0,
    'A batch staged for a different Save must not survive a file switch');
  assert.equal(await page.getByRole('link',{name:'コピーをダウンロード'}).count(),0,
    'A previously generated edited copy must not survive a file switch');

  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('現在の数量').fill('99');
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'encrypted.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'検証できませんでした'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('status').count(),0);
  assert.equal(await page.getByRole('link',{name:'コピーをダウンロード'}).count(),0);

  // Rust-only owned-slot discovery + source-verified published DB-00 labels.
  // No private Save bytes or counts are sent to the catalog Worker.
  await page.getByRole('button',{name:'破棄'}).click();
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'owned-items.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('status').filter({hasText:'4件'}).waitFor({timeout:30000});
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByText('ピュアナイトシャード').waitFor({timeout:45000});
  const questPanel=page.getByRole('region',{name:'クエスト参照'});
  await questPanel.getByRole('button',{name:'DB-03クエストIDと照合'}).click();
  await questPanel.getByRole('status').filter({
    hasText:'DB-03のクエスト定義と一致'
  }).waitFor({timeout:30000});
  assert.match(await questPanel.innerText(),/保存中のMission ID：3件/);
  assert.match(await questPanel.innerText(),/一致：1件/);
  assert.match(await questPanel.innerText(),/未収録：1件/);
  assert.match(await questPanel.innerText(),/進行状況は判定しません/);
  assert.equal(await questPanel.getByRole('alert').count(),0);
  const worldPanel=page.getByRole('region',{name:'ワールド参照'});
  await worldPanel.getByRole('status').filter({hasText:'2種類'}).waitFor({timeout:30000});
  await worldPanel.getByText('ピュアナイトシャード').waitFor({timeout:30000});
  assert.match(await worldPanel.innerText(),/差分Gridの削除マーカー：1件/);
  assert.match(await worldPanel.innerText(),/所有数・全配置数・配置可否を示すものではありません/);
  const objects=worldPanel.getByRole('region',{name:'配置オブジェクト'});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'3件'}).waitFor({timeout:30000});
  assert.match(await objects.innerText(),/X 45 \/ Y 9 · GridOrientation_Up/);
  assert.match(await objects.innerText(),/X -12 \/ Y 8 · GridOrientation_Left/);
  assert.match(await objects.innerText(),/座標未確認/);
  assert.match(await objects.innerText(),/座標編集はテスト用です/);
  assert.equal(await objects.getByText('do-not-export').count(),0);
  await objects.getByLabel('配置アイテム検索').fill('30000031');
  assert.match(await objects.innerText(),/ピュアナイトシャード/);
  assert.doesNotMatch(await objects.innerText(),/X -12/);
  await objects.getByLabel('配置アイテム検索').fill('');
  // Native Grid IDs never cross this Rust/WASM boundary. Display only an
  // ephemeral per-open Grid number and real signed X/Y values in a bounded
  // 2D coordinate plane. Clicking the map reuses the existing secure editor.
  const map=objects.getByRole('region',{name:'セーブ内Grid配置マップ'});
  const pickGrid=map.getByLabel('表示するセーブGrid');
  await map.getByRole('button',{name:'配置 #1 をマップから選択'}).click();
  const mapCoordinateEditor=objects.getByLabel('座標編集',{exact:true});
  assert.equal(await mapCoordinateEditor.getByLabel('新しいX').inputValue(),'45');
  assert.equal(await mapCoordinateEditor.getByLabel('新しいY').inputValue(),'9');

  // User-driven map click creates ONLY an X/Y input draft. It must not
  // write a Save, silently accept unverified native floor dimensions, or
  // bypass the existing Rust/WASM optimistic checks and separate-copy step.
  await map.getByRole('button',{name:'移動先をマップで指定'}).click();
  const mapTarget=map.getByRole('button',{name:'マップ上で移動先を指定'});
  const targetBounds=await mapTarget.boundingBox();
  assert.ok(targetBounds&&targetBounds.width>100&&targetBounds.height>100);
  await mapTarget.click({position:{
    x:Math.floor(targetBounds.width*0.75),
    y:Math.floor(targetBounds.height*0.25)
  }});
  const draftedX=Number(await mapCoordinateEditor.getByLabel('新しいX').inputValue());
  const draftedY=Number(await mapCoordinateEditor.getByLabel('新しいY').inputValue());
  assert.ok(Number.isInteger(draftedX)&&Number.isInteger(draftedY));
  assert.notEqual(draftedX,45);
  assert.notEqual(draftedY,9);
  await map.getByRole('status').filter({
    hasText:'セーブはまだ変更されていません'
  }).waitFor();
  assert.equal(await map.locator('.draft-marker').count(),1);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].Y,9);
  await pickGrid.selectOption('2');
  await map.getByRole('button',{name:'配置 #3 をマップから選択'}).click();
  assert.equal(await mapCoordinateEditor.getByLabel('新しいX').inputValue(),'-12');
  assert.equal(await mapCoordinateEditor.getByLabel('新しいY').inputValue(),'8');
  assert.match(await map.innerText(),/Y 0 ～ 16/);
  assert.match(await map.innerText(),/配置範囲、衝突判定やワールド座標ではありません/);
  await pickGrid.selectOption('1');
  await map.getByRole('button',{name:'配置 #1 をマップから選択'}).click();
  // The signed X/Y coordinates are edited only after Rust re-resolves a
  // private grid/object identity from this file's local ordinal. The P1G
  // is rebuilt and independently reopened; no private identity is published.
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  const coordinates=objects.getByLabel('座標編集',{exact:true});
  await coordinates.getByLabel('新しいX').fill('57');
  await coordinates.getByLabel('新しいY').fill('-4');
  await coordinates.getByRole('button',{name:'座標変更を検証'}).click();
  await coordinates.getByRole('status').filter({
    hasText:'座標変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  assert.equal(await coordinates.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await coordinates.getByRole('button',{name:'座標変更コピーを生成'}).click();
  const coordinateLink=coordinates.getByRole('link',{name:'座標コピーをダウンロード'});
  await coordinateLink.waitFor({timeout:30000});
  const coordinateEvent=page.waitForEvent('download');
  await coordinateLink.click();
  const coordinateCopy=readSyntheticEncryptedP1g(
    await readFile(await (await coordinateEvent).path())
  );
  const editedObject=coordinateCopy.World.GridCollection.Grids['101'].Objects['1'];
  assert.equal(editedObject.X,57);
  assert.equal(editedObject.Y,-4);
  assert.equal(editedObject.Orientation,'GridOrientation_Up');
  assert.equal(editedObject.PrivateState,'do-not-export');
  assert.equal(coordinateCopy.World.GridCollection.Grids['101'].Objects['2'].ItemID,30000031);
  assert.equal(coordinateCopy.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].X,-12);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].Y,9);
  assert.equal(coordinateCopy.Player.ListInventories['100'].Inventory['777'].Amount,1);
  // Two independent objects, one full and one DiffGrid, are committed
  // atomically in a *single* rebuilt P1G. No source mutation is permitted.
  await objects.getByRole('button',{name:'配置 #3 の座標を編集'}).click();
  await coordinates.getByLabel('新しいX').fill('130');
  await coordinates.getByLabel('新しいY').fill('14');
  await coordinates.getByRole('button',{name:'座標編集に追加'}).click();
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  await coordinates.getByLabel('新しいX').fill('-80');
  await coordinates.getByLabel('新しいY').fill('25');
  await coordinates.getByRole('button',{name:'座標編集に追加'}).click();
  const batchCoords=objects.getByLabel('一括座標編集');
  await batchCoords.getByText('2 / 16件').waitFor();
  // Revise a queued DiffGrid destination IN PLACE, without deleting and
  // restaging either original target. The row button must also navigate the
  // numeric map to that row's local Grid, even after manual Grid switching.
  const batchGridSelect=objects.getByRole('region',{
    name:'セーブ内Grid配置マップ'
  }).getByLabel('表示するセーブGrid');
  await batchCoords.getByRole('button',{
    name:'座標編集 #3 を修正'
  }).click();
  assert.equal(await batchGridSelect.inputValue(),'2');
  assert.equal(await coordinates.getByLabel('新しいX').inputValue(),'130');
  assert.equal(await coordinates.getByLabel('新しいY').inputValue(),'14');
  await coordinates.getByLabel('新しいX').fill('2147483648');
  await coordinates.getByRole('button',{
    name:'登録済みの座標を更新'
  }).click();
  assert.match(await batchCoords.innerText(),/X -12→130/);
  assert.match(await batchCoords.innerText(),/Y 8→14/);
  await coordinates.getByLabel('新しいX').fill('141');
  await coordinates.getByLabel('新しいY').fill('15');
  await coordinates.getByRole('button',{
    name:'登録済みの座標を更新'
  }).click();
  assert.match(await batchCoords.innerText(),/X -12→141/);
  assert.match(await batchCoords.innerText(),/Y 8→15/);
  assert.match(await batchCoords.innerText(),/X 45→-80/);
  assert.equal(await batchCoords.getByRole('button',{
    name:'座標編集 #3 を修正'
  }).count(),1);
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  assert.equal(await batchGridSelect.inputValue(),'1');
  await batchGridSelect.selectOption('2');
  assert.equal(await batchGridSelect.inputValue(),'2');
  // Selecting the same list row again still navigates correctly; manual
  // Grid switching alone should never snap back to the old selection.
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  assert.equal(await batchGridSelect.inputValue(),'1');
  await batchCoords.getByRole('button',{name:'一括座標変更を検証'}).click();
  await coordinates.getByRole('status').filter({
    hasText:'2件の座標変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await coordinates.getByRole('button',{name:'座標変更コピーを生成'}).click();
  const batchCoordinateLink=coordinates.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await batchCoordinateLink.waitFor({timeout:30000});
  const gridBatchEvent=page.waitForEvent('download');
  await batchCoordinateLink.click();
  const gridBatch=readSyntheticEncryptedP1g(
    await readFile(await (await gridBatchEvent).path())
  );
  const fullObject=gridBatch.World.GridCollection.Grids['101'].Objects['1'];
  const diffObject=gridBatch.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'];
  assert.equal(fullObject.X,-80);
  assert.equal(fullObject.Y,25);
  assert.equal(diffObject.X,141);
  assert.equal(diffObject.Y,15);
  assert.equal(fullObject.Orientation,'GridOrientation_Up');
  assert.equal(diffObject.Orientation,'GridOrientation_Left');
  assert.equal(fullObject.PrivateState,'do-not-export');
  assert.equal(gridBatch.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(gridBatch.World.GridCollection.DiffGrids['102'].RemovedObjects[0],5);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(quantityProfile.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].X,-12);
  // Cardinal native enum string edit is independent of X/Y, Grid and Item
  // identity. The original (and all unknown fields) must remain untouched.
  await objects.getByRole('button',{name:'配置 #1 の向きを編集'}).click();
  const direction=objects.getByLabel('向き編集',{exact:true});
  await direction.getByLabel('新しい向き').selectOption('GridOrientation_Right');
  await direction.getByRole('button',{name:'向き変更を検証'}).click();
  await direction.getByRole('status').filter({
    hasText:'向き変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  assert.equal(await direction.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await direction.getByRole('button',{name:'向き変更コピーを生成'}).click();
  const directionLink=direction.getByRole('link',{name:'向きコピーをダウンロード'});
  await directionLink.waitFor({timeout:30000});
  const directionEvent=page.waitForEvent('download');
  await directionLink.click();
  const directionCopy=readSyntheticEncryptedP1g(
    await readFile(await (await directionEvent).path())
  );
  const directionObject=directionCopy.World.GridCollection.Grids['101'].Objects['1'];
  assert.equal(directionObject.Orientation,'GridOrientation_Right');
  assert.equal(directionObject.X,45);
  assert.equal(directionObject.Y,9);
  assert.equal(directionObject.PrivateState,'do-not-export');
  assert.equal(directionCopy.World.GridCollection.Grids['101'].Objects['2'].ItemID,30000031);
  assert.equal(directionCopy.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].Orientation,
    'GridOrientation_Left');
  assert.equal(directionCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].Orientation,
    'GridOrientation_Up');
  // Verify a single atomic transform of X, Y and cardinal orientation.
  // The exported encrypted P1G is independently reopened; original remains
  // untouched and all unrelated fields/objects must match exactly.
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  const transform=objects.getByLabel('座標編集',{exact:true});
  await transform.getByLabel('新しいX').fill('91');
  await transform.getByLabel('新しいY').fill('-17');
  await transform.getByLabel('座標と同時変更する向き')
    .selectOption('GridOrientation_Down');
  await transform.getByRole('button',{name:'位置と向きを同時検証'}).click();
  await transform.getByRole('status').filter({
    hasText:'位置と向きの同時変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  assert.equal(await transform.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await transform.getByRole('button',{name:'位置と向きのコピーを生成'}).click();
  const transformLink=transform.getByRole('link',{name:'座標コピーをダウンロード'});
  await transformLink.waitFor({timeout:30000});
  const transformEvent=page.waitForEvent('download');
  await transformLink.click();
  const editedTransform=readSyntheticEncryptedP1g(
    await readFile(await (await transformEvent).path())
  );
  const moved=editedTransform.World.GridCollection.Grids['101'].Objects['1'];
  assert.equal(moved.X,91);
  assert.equal(moved.Y,-17);
  assert.equal(moved.Orientation,'GridOrientation_Down');
  assert.equal(moved.PrivateState,'do-not-export');
  assert.equal(editedTransform.World.GridCollection.Grids['101'].Objects['2'].ItemID,30000031);
  assert.equal(editedTransform.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].X,-12);
  assert.equal(editedTransform.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].Orientation,
    'GridOrientation_Left');
  assert.equal(editedTransform.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].Orientation,
    'GridOrientation_Up');

  // Mixed atomic batch: rotation-only on one saved GridObject, and
  // X/Y plus rotation on another DiffGrid object. Verify one P1G
  // output contains both changes without modifying either original.
  await direction.getByLabel('新しい向き').selectOption('GridOrientation_Right');
  await direction.getByRole('button',{name:'向きを一括配置変更に追加'}).click();
  await objects.getByRole('button',{name:'配置 #3 の座標を編集'}).click();
  await coordinates.getByLabel('新しいX').fill('34');
  await coordinates.getByLabel('新しいY').fill('-6');
  await coordinates.getByLabel('座標と同時変更する向き')
    .selectOption('GridOrientation_Down');
  await coordinates.getByRole('button',{name:'一括配置変更に追加'}).click();
  const mixedPanel=objects.getByLabel('一括配置変更',{exact:true});
  await mixedPanel.getByText('2 / 16件').waitFor();

  // First preview the original queued batch, then modify drafts in-place.
  // A revision invalidates the previous Rust receipt and requires a new
  // validation before the independently generated encrypted P1G copy.
  await mixedPanel.getByRole('button',{name:'一括配置変更を検証'}).click();
  await coordinates.getByRole('status').filter({
    hasText:'2件の配置変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  await mixedPanel.getByRole('button',{name:'配置編集 #1 を修正'}).click();
  assert.equal(await coordinates.getByRole('status').filter({
    hasText:'2件の配置変更をRust/WASMで検証しました'
  }).count(),0,'queued revision invalidates old Rust preview receipt');
  assert.equal(await coordinates.getByLabel('新しいX').inputValue(),'45');
  assert.equal(await coordinates.getByLabel('新しいY').inputValue(),'9');
  assert.equal(await coordinates.getByLabel('座標と同時変更する向き')
    .inputValue(),'GridOrientation_Right');
  // Invalid no-op orientation-only modification may not remove an already
  // queued rotation, and must leave other queued edits untouched.
  await coordinates.getByLabel('座標と同時変更する向き')
    .selectOption('GridOrientation_Up');
  await coordinates.getByRole('button',{
    name:'登録済みの配置変更を更新'
  }).click();
  assert.match(await mixedPanel.innerText(),/Right/);
  await coordinates.getByLabel('座標と同時変更する向き')
    .selectOption('GridOrientation_Down');
  await coordinates.getByRole('button',{
    name:'登録済みの配置変更を更新'
  }).click();
  assert.match(await mixedPanel.innerText(),/Up\s*→Down/);
  assert.match(await mixedPanel.innerText(),/X -12→34/);

  // Change a combined numeric position + rotation draft. An out-of-range
  // coordinate is rejected even if the orientation is a valid cardinal.
  await mixedPanel.getByRole('button',{name:'配置編集 #3 を修正'}).click();
  assert.equal(await coordinates.getByLabel('新しいX').inputValue(),'34');
  assert.equal(await coordinates.getByLabel('新しいY').inputValue(),'-6');
  assert.equal(await coordinates.getByLabel('座標と同時変更する向き')
    .inputValue(),'GridOrientation_Down');
  await coordinates.getByLabel('新しいX').fill('2147483648');
  await coordinates.getByRole('button',{
    name:'登録済みの配置変更を更新'
  }).click();
  assert.match(await mixedPanel.innerText(),/X -12→34/);
  await coordinates.getByLabel('新しいX').fill('46');
  await coordinates.getByLabel('新しいY').fill('-9');
  await coordinates.getByLabel('座標と同時変更する向き')
    .selectOption('GridOrientation_Right');
  await coordinates.getByRole('button',{
    name:'登録済みの配置変更を更新'
  }).click();
  assert.match(await mixedPanel.innerText(),/X -12→46/);
  assert.match(await mixedPanel.innerText(),/Y 8→-9/);
  assert.match(await mixedPanel.innerText(),/Left\s*→Right/);
  assert.match(await mixedPanel.innerText(),/Up\s*→Down/);
  assert.match(await mixedPanel.innerText(),/2 \/ 16件/);
  // Preserve the earlier coordinate batch while showing the independent
  // mixed batch. Rotation-only edits do not create additional ghost markers.
  await pickGrid.selectOption('2');
  assert.equal(await map.locator('.queued-ghost').count(),2);
  assert.equal(await map.locator('.queued-ghost[title*="#3 X 141 Y 15"]').count(),1);
  assert.equal(await map.locator('.queued-ghost[title*="#3 X 46 Y -9"]').count(),1);
  await pickGrid.selectOption('1');
  assert.equal(await map.locator('.queued-ghost').count(),1);
  assert.equal(await map.locator('.queued-ghost[title*="#1 X -80 Y 25"]').count(),1);
  await mixedPanel.getByRole('button',{name:'一括配置変更を検証'}).click();
  await coordinates.getByRole('status').filter({
    hasText:'2件の配置変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  assert.equal(await coordinates.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await coordinates.getByRole('button',{name:'座標変更コピーを生成'}).click();
  const mixedLink=coordinates.getByRole('link',{name:'座標コピーをダウンロード'});
  await mixedLink.waitFor({timeout:30000});
  const mixedEvent=page.waitForEvent('download');
  await mixedLink.click();
  const mixedSave=readSyntheticEncryptedP1g(
    await readFile(await (await mixedEvent).path())
  );
  const mixedFull=mixedSave.World.GridCollection.Grids['101'].Objects['1'];
  const mixedDiff=mixedSave.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'];
  assert.equal(mixedFull.X,45);
  assert.equal(mixedFull.Y,9);
  assert.equal(mixedFull.Orientation,'GridOrientation_Down');
  assert.equal(mixedDiff.X,46);
  assert.equal(mixedDiff.Y,-9);
  assert.equal(mixedDiff.Orientation,'GridOrientation_Right');
  assert.equal(mixedFull.PrivateState,'do-not-export');
  assert.equal(mixedSave.World.GridCollection.DiffGrids['102'].RemovedObjects[0],5);
  assert.equal(mixedSave.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(quantityProfile.World.GridCollection.Grids['101'].Objects['1'].Orientation,
    'GridOrientation_Up');
  assert.equal(quantityProfile.World.GridCollection.DiffGrids['102'].ModifiedObjects['6'].X,-12);
  // Two saved references for sample furniture: one full and one non-removed
  // DiffGrid object, not three (the removed DiffGrid identity is suppressed).
  // Private DB-04 reference index supplied as a local, synthetic file.
  // DB-05 verifies it using the existing DB-04 WorldReferenceIndex and Rust
  // then matches native full Grid paths and unverified DiffGrid layout/ID candidates.
  const layout='SceneLayouts/Synthetic/Grid.json';
  const data='GridData/Synthetic/Grid.json';
  const db04={
    schema:'wand.db04.native-reference-graph@1',
    target:{platform:'Steam',gameVersion:'1.26.2',
      nativeWorldManifestSha256:'a'.repeat(64)},
    status:'private_partial_exact_source_relations',
    sourceManifestStatus:'synthetic_browser_fixture',
    privateOnly:true,publicationAuthorized:false,
    provenance:{syntheticOnly:true},
    worlds:[],scenes:[],areas:[],
    layouts:[{
      layoutId:layout,layoutKind:'nativeGridCollection',
      nativeDefaultObjectCount:0,parentWorldId:null,parentAreaRefId:null,
      nativeSourceScopeLabel:'Synthetic',
      sourceWorldMembershipVerified:false,
      worldCoordinatesVerified:false,placementLegalityVerified:false
    }],
    gridData:[{
      gridDataPath:data,nativeSizeX:10,nativeSizeY:10,
      nativeSourceFormat:'synthetic',
      gridLocalToWorldTransformVerified:false,placementLegalityVerified:false
    }],
    gridRefs:[{
      gridRefId:layout+'#grid=7',
      gridRefIdKind:'derivedLayoutGridIdComposite',
      layoutId:layout,nativeGridId:7,gridDataPath:data,
      gridDataPresent:true,areaRefId:null,worldId:null,
      tessellationFactor:2,originalDefaultObjectCount:0,
      nativeWorldCoordinatesVerified:false,placementLegalityVerified:false
    }],
    initialItemRefs:[],worldCoverage:[],
    coverage:{
      sourceInitialGridObjects:0,sourceInitialGridObjectsWithoutVerifiedWorldLink:0,
      worldDefinitionsInSubset:0,nativeAreaLayoutReferences:0,
      gridReferencesInSubset:1,
      completeGameHierarchyVerified:false,
      allDlcAndAdventurePackIdsVerified:false,
      worldPlacementPermissionVerified:false,sourceCoverageComplete:false
    }
  };
  await worldPanel.getByLabel('DB-04参照データを選択').setInputFiles({
    name:'local-private-db04.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(db04))
  });
  await worldPanel.getByRole('button',{name:'DB-04 Gridパスを照合'}).click();
  await worldPanel.getByText(/通常Gridの参照パス一致/).waitFor({timeout:30000});
  assert.match(await worldPanel.innerText(),/通常Gridの参照パス一致：1 \/ 1/);
  assert.match(await worldPanel.innerText(),/差分Gridの構造上の候補：1 \/ 1件/);
  assert.match(await worldPanel.innerText(),/差分Gridの原本ハッシュ未検証：1件/);
  assert.match(await worldPanel.innerText(),/候補は配置・原本Gridの同一性を証明しません/);
  // The verified local DB-04 graph annotates saved local ordinals with
  // source GridData dimensions but never authorizes placements or exposes
  // original/saved Grid IDs. Full Grid uses exact source path pairs;
  // DiffGrid is hash-unverified even when only one source candidate exists.
  const localObjects=await objects.innerText();
  assert.match(localObjects,/原本Grid参照パス候補/);
  assert.match(localObjects,/差分Gridの構造候補（ハッシュ未検証）/);
  assert.match(localObjects,/原本GridData 10 × 10/);
  assert.match(localObjects,/Tessellation 2/);
  assert.match(localObjects,/原本初期アンカー整数範囲/);
  assert.match(localObjects,/0～19 ×\s*0～19/);
  assert.match(localObjects,/数値的に範囲外/);
  assert.match(localObjects,/セーブとの座標系同一性は未確認/);
  assert.doesNotMatch(localObjects,/配置を拒否/);
  assert.doesNotMatch(localObjects,/GridData\/Synthetic\/Grid.json/);
  assert.doesNotMatch(localObjects,/SceneLayouts\/Synthetic\/Grid.json/);
  assert.match(await worldPanel.innerText(),/配置範囲・衝突判定/);

  assert.match(await worldPanel.innerText(),/原本再検証・全配置数・所有権/);
  assert.equal(await worldPanel.getByRole('alert').count(),0);
  await worldPanel.getByLabel('ワールド参照検索').fill('40000001');
  assert.match(await worldPanel.innerText(),/2件/);
  await worldPanel.getByLabel('ワールド参照検索').fill('');
  await page.getByLabel('所持アイテム検索').fill('ピュアナイトシャード');
  await page.getByRole('button',{
    name:'所持アイテム 30000031 を選択'
  }).click();
  assert.equal(await page.getByLabel('Item ID').inputValue(),'30000031');
  assert.equal(await page.getByLabel('現在の数量').inputValue(),'1');
  await page.getByLabel('変更後の数量').fill('250');
  await page.getByRole('button',{name:'変更を検証',exact:true}).click();
  await page.getByRole('status').filter({hasText:'数量変更'}).waitFor({timeout:30000});
  assert.equal(await page.getByRole('alert').count(),0);

  // Group translation uses the existing Rust optimistic 2–16 target
  // coordinate batch, not a new JS Save writer. Two original Full Grid
  // objects move by one shared signed delta; all unknown fields and the
  // other DiffGrid remain byte-identical inside the rebuilt encrypted P1G.
  const groupOriginal=structuredClone(quantityProfile);
  groupOriginal.World.GridCollection.Grids['101'].Objects['2']={
    ...groupOriginal.World.GridCollection.Grids['101'].Objects['2'],
    X:50,Y:10,PrivateGroup:'keep-both'
  };
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'group-translate.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(groupOriginal)
  });
  // Local picker resets the read-only lists. Load inventory evidence first,
  // as required by the existing Save preview's gated World UI.
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByRole('status').filter({hasText:'件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'3件'})
    .waitFor({timeout:30000});
  const groupMap=objects.getByRole('region',{name:'セーブ内Grid配置マップ'});
  await groupMap.getByRole('button',{name:'複数配置を一括移動'}).click();
  await groupMap.getByRole('button',{name:'配置 1 をグループへ追加'}).click();
  await groupMap.getByRole('button',{name:'配置 2 をグループへ追加'}).click();
  const stageGroup=groupMap.getByRole('button',{
    name:'選択した2件を座標編集に追加'
  });
  assert.equal(await stageGroup.isDisabled(),true,
    'zero translation must never stage a no-op');
  await groupMap.getByLabel('グループ移動X').fill('2147483647');
  assert.equal(await stageGroup.isDisabled(),true,
    'signed integer overflow must be rejected before staging');
  // Click-to-draft group translation uses the first selected saved
  // object as the anchor. This is only an integer-coordinate proposal:
  // even a visible ghost must not mutate original Save or export.
  await groupMap.getByRole('button',{
    name:'グループの移動先をマップで指定'
  }).click();
  const groupClickTarget=groupMap.getByRole('button',{
    name:'グループの移動先をマップで指定'
  });
  const groupTargetBounds=await groupClickTarget.boundingBox();
  assert.ok(groupTargetBounds&&groupTargetBounds.width>100);
  await groupClickTarget.click({position:{
    x:Math.floor(groupTargetBounds.width*.75),
    y:Math.floor(groupTargetBounds.height*.25)
  }});
  const mapDx=Number(await groupMap.getByLabel('グループ移動X').inputValue());
  const mapDy=Number(await groupMap.getByLabel('グループ移動Y').inputValue());
  assert.ok(Number.isSafeInteger(mapDx)&&Number.isSafeInteger(mapDy));
  assert.ok(mapDx!==0||mapDy!==0);
  assert.equal(await stageGroup.isEnabled(),true);
  assert.equal(await groupMap.locator('.group-ghost').count(),2);
  assert.equal(groupOriginal.World.GridCollection.Grids['101'].Objects['1'].X,45);
  await groupMap.getByRole('button',{name:'マップ指定を終了'}).click();
  // A valid candidate can lie far outside the observed Save positions.
  // All target ghosts must remain visible rather than silently vanish.
  await groupMap.getByLabel('グループ移動X').fill('150');
  await groupMap.getByLabel('グループ移動Y').fill('100');
  assert.equal(await groupMap.locator('.group-ghost').count(),2);
  assert.equal(await groupMap.locator(
    '.group-ghost[title*="#1 X 195 Y 109"]'
  ).count(),1);
  assert.equal(await groupMap.locator(
    '.group-ghost[title*="#2 X 200 Y 110"]'
  ).count(),1);
  const groupXMaximum=Number((await groupMap.locator('.x-axis')
    .innerText()).split('～')[1].trim());
  assert.ok(groupXMaximum>=200,'viewport includes both group destinations');
  await groupMap.getByLabel('グループ移動X').fill('7');
  await groupMap.getByLabel('グループ移動Y').fill('-3');
  assert.equal(await stageGroup.isEnabled(),true);
  assert.equal(await groupMap.locator('.group-ghost').count(),2);
  await stageGroup.click();
  const stagedGroup=objects.getByLabel('一括座標編集');
  await stagedGroup.getByText('2 / 16件').waitFor();
  // Registering the batch keeps both destinations visible on the map,
  // including their actual target numeric coordinates.
  assert.equal(await groupMap.locator('.queued-ghost').count(),2);
  assert.equal(await groupMap.locator('.queued-ghost[title*="#1 X 52 Y 6"]').count(),1);
  assert.equal(await groupMap.locator('.queued-ghost[title*="#2 X 57 Y 7"]').count(),1);
  assert.match(await groupMap.innerText(),/編集候補 2件/);
  const groupEditor=objects.getByLabel('座標編集',{exact:true});
  assert.equal(await groupEditor.getByLabel('新しいX').inputValue(),'52');
  assert.equal(await groupEditor.getByLabel('新しいY').inputValue(),'6');
  await stagedGroup.getByRole('button',{name:'一括座標変更を検証'}).click();
  await groupEditor.getByRole('status').filter({
    hasText:'2件の座標変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  assert.equal(await groupEditor.getByRole('alert').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await groupEditor.getByRole('button',{name:'座標変更コピーを生成'}).click();
  const groupLink=groupEditor.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await groupLink.waitFor({timeout:30000});
  const groupEvent=page.waitForEvent('download');
  await groupLink.click();
  const groupCopy=readSyntheticEncryptedP1g(
    await readFile(await (await groupEvent).path())
  );
  const groupObjects=groupCopy.World.GridCollection.Grids['101'].Objects;
  assert.equal(groupObjects['1'].X,52);
  assert.equal(groupObjects['1'].Y,6);
  assert.equal(groupObjects['2'].X,57);
  assert.equal(groupObjects['2'].Y,7);
  assert.equal(groupObjects['1'].Orientation,'GridOrientation_Up');
  assert.equal(groupObjects['1'].PrivateState,'do-not-export');
  assert.equal(groupObjects['2'].PrivateGroup,'keep-both');
  assert.equal(groupCopy.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].X,-12);
  assert.equal(groupCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(groupOriginal.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(groupOriginal.World.GridCollection.Grids['101'].Objects['2'].X,50);
  assert.equal(groupObjects['2'].X-groupObjects['1'].X,
    groupOriginal.World.GridCollection.Grids['101'].Objects['2'].X-
    groupOriginal.World.GridCollection.Grids['101'].Objects['1'].X);
  await stagedGroup.getByRole('button',{name:'座標編集 #1 を削除'}).click();
  assert.equal(await groupMap.locator('.queued-ghost').count(),1,
    'removing a staged edit immediately removes its destination ghost');

  // A bounded, experimental 90-degree saved-numeric group turn stages mixed
  // coordinate + cardinal orientation edits. Native Rust reopens the rebuilt
  // encrypted P1G and preserves untouched DiffGrid and unknown fields.
  const rotatedOriginal=structuredClone(groupOriginal);
  rotatedOriginal.World.GridCollection.Grids['101'].Objects['2'].Orientation=
    'GridOrientation_Left';
  // Rotation from this native-numeric source places object 2 outside the
  // observed Y bounds, requiring the viewport to expand around its draft.
  rotatedOriginal.World.GridCollection.Grids['101'].Objects['2'].X=150;
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'group-rotate.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(rotatedOriginal)
  });
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByRole('status').filter({hasText:'件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'3件'})
    .waitFor({timeout:30000});
  const rotateMap=objects.getByRole('region',{name:'セーブ内Grid配置マップ'});
  await rotateMap.getByRole('button',{name:'複数配置を一括移動'}).click();
  await rotateMap.getByRole('button',{name:'配置 1 をグループへ追加'}).click();
  await rotateMap.getByRole('button',{name:'配置 2 をグループへ追加'}).click();
  await rotateMap.getByRole('button',{name:'右へ90°（数値座標）'}).click();
  assert.equal(await rotateMap.locator('.group-ghost').count(),1);
  assert.equal(await rotateMap.locator(
    '.group-ghost[title*="#2 X 44 Y 114"]'
  ).count(),1);
  const rotateYMaximum=Number((await rotateMap.locator('.y-axis')
    .innerText()).split('～')[1].trim());
  assert.ok(rotateYMaximum>=114,'viewport includes offscreen rotation target');
  // Change the pivot AFTER requesting a right turn. The preview must
  // recompute immediately without changing the selected group or original.
  const pivotSelect=rotateMap.getByLabel('回転中心');
  assert.equal(await pivotSelect.inputValue(),'1');
  await pivotSelect.selectOption('2');
  assert.equal(await rotateMap.locator('.group-ghost').count(),1);
  assert.equal(await rotateMap.locator(
    '.group-ghost[title*="#1 X 151 Y -95"]'
  ).count(),1);
  assert.equal(await rotateMap.locator('.marker.pivot').count(),1);
  assert.equal(await rotateMap.locator(
    '.marker.pivot[aria-label="配置 2 をグループから除外"]'
  ).count(),1);
  const shiftedYMinimum=Number((await rotateMap.locator('.y-axis')
    .innerText()).split('～')[0].replace('Y','').trim());
  assert.ok(shiftedYMinimum<=-95,'chosen pivot destination is in view');
  await rotateMap.getByRole('button',{
    name:'2件の回転を配置編集に追加'
  }).click();
  const rotateBatch=objects.getByLabel('一括配置変更',{exact:true});
  await rotateBatch.getByText('2 / 16件').waitFor();
  assert.equal(await rotateMap.locator('.queued-ghost').count(),1);
  assert.equal(await rotateMap.locator(
    '.queued-ghost[title*="#1 X 151 Y -95"]'
  ).count(),1);
  const rotateEditor=objects.getByLabel('座標編集',{exact:true});
  await rotateBatch.getByRole('button',{name:'一括配置変更を検証'}).click();
  await rotateEditor.getByRole('status').filter({
    hasText:'2件の配置変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await rotateEditor.getByRole('button',{name:'座標変更コピーを生成'}).click();
  const rotateLink=rotateEditor.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await rotateLink.waitFor({timeout:30000});
  const rotateEvent=page.waitForEvent('download');
  await rotateLink.click();
  const rotatedCopy=readSyntheticEncryptedP1g(
    await readFile(await (await rotateEvent).path())
  );
  const rotatedObjects=rotatedCopy.World.GridCollection.Grids['101'].Objects;
  assert.deepEqual([
    rotatedObjects['1'].X,rotatedObjects['1'].Y,
    rotatedObjects['1'].Orientation
  ],[151,-95,'GridOrientation_Right']);
  assert.deepEqual([
    rotatedObjects['2'].X,rotatedObjects['2'].Y,
    rotatedObjects['2'].Orientation
  ],[150,10,'GridOrientation_Up']);
  assert.equal(rotatedObjects['1'].PrivateState,'do-not-export');
  assert.equal(rotatedObjects['2'].PrivateGroup,'keep-both');
  assert.equal(rotatedCopy.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].X,-12);
  assert.equal(rotatedCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(rotatedOriginal.World.GridCollection.Grids['101'].Objects['1']
    .Orientation,'GridOrientation_Up');
  assert.equal(rotatedOriginal.World.GridCollection.Grids['101'].Objects['2'].X,150);

  // Both independently staged Grid queues can now be exported as ONE
  // Rust-validated, independently reopened P1G when their targets do not
  // conflict. One full-grid coordinate and one DiffGrid rotation change.
  const joinedOriginal=structuredClone(quantityProfile);
  joinedOriginal.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].ExtraFutureField='preserve';
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'combined-independent.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(joinedOriginal)
  });
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByRole('status').filter({hasText:'件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'3件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  const joinedCoordinates=objects.getByLabel('座標編集',{exact:true});
  await joinedCoordinates.getByLabel('新しいX').fill('60');
  await joinedCoordinates.getByLabel('新しいY').fill('20');
  await joinedCoordinates.getByRole('button',{name:'座標編集に追加'}).click();
  await objects.getByRole('button',{name:'配置 #3 の向きを編集'}).click();
  const joinedDirection=objects.getByLabel('向き編集',{exact:true});
  await joinedDirection.getByLabel('新しい向き')
    .selectOption('GridOrientation_Right');
  await joinedDirection.getByRole('button',{
    name:'向きを一括配置変更に追加'
  }).click();
  const unified=objects.getByLabel('座標と配置の統合編集');
  const unifiedVerify=unified.getByRole('button',{
    name:/両キューをまとめて検証/
  });
  assert.equal(await unifiedVerify.isEnabled(),true);
  assert.match(await unifiedVerify.innerText(),/2件/);
  await unifiedVerify.click();
  await joinedCoordinates.getByRole('status').filter({
    hasText:'2件の座標・向き変更をRust/WASMで検証しました。'
  }).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await joinedCoordinates.getByRole('button',{
    name:'座標変更コピーを生成'
  }).click();
  const unifiedLink=joinedCoordinates.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await unifiedLink.waitFor({timeout:30000});
  const unifiedDownload=page.waitForEvent('download');
  await unifiedLink.click();
  const unifiedCopy=readSyntheticEncryptedP1g(
    await readFile(await (await unifiedDownload).path())
  );
  const unifiedFull=unifiedCopy.World.GridCollection.Grids['101'].Objects['1'];
  const unifiedDiff=unifiedCopy.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'];
  assert.deepEqual([unifiedFull.X,unifiedFull.Y,unifiedFull.Orientation],
    [60,20,'GridOrientation_Up']);
  assert.deepEqual([unifiedDiff.X,unifiedDiff.Y,unifiedDiff.Orientation],
    [-12,8,'GridOrientation_Right']);
  assert.equal(unifiedFull.PrivateState,'do-not-export');
  assert.equal(unifiedDiff.ExtraFutureField,'preserve');
  assert.equal(unifiedCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(joinedOriginal.World.GridCollection.Grids['101'].Objects['1'].X,45);
  assert.equal(joinedOriginal.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].Orientation,'GridOrientation_Left');

  // An orientation-only draft for the SAME ordinal can be folded into its
  // coordinate change safely. This is still a single Rust mixed target.
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'combined-overlap.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(quantityProfile)
  });
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByRole('status').filter({hasText:'件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'3件'})
    .waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置 #1 の座標を編集'}).click();
  await joinedCoordinates.getByLabel('新しいX').fill('71');
  await joinedCoordinates.getByLabel('新しいY').fill('-18');
  await joinedCoordinates.getByRole('button',{name:'座標編集に追加'}).click();
  await objects.getByRole('button',{name:'配置 #1 の向きを編集'}).click();
  await joinedDirection.getByLabel('新しい向き')
    .selectOption('GridOrientation_Down');
  await joinedDirection.getByRole('button',{
    name:'向きを一括配置変更に追加'
  }).click();
  const overlap=objects.getByLabel('座標と配置の統合編集');
  const overlapVerify=overlap.getByRole('button',{
    name:/両キューをまとめて検証/
  });
  assert.equal(await overlapVerify.isEnabled(),true);
  assert.match(await overlapVerify.innerText(),/1件/);
  await overlapVerify.click();
  await joinedCoordinates.getByRole('status').filter({
    hasText:'1件の座標・向き変更をRust/WASMで検証しました。'
  }).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await joinedCoordinates.getByRole('button',{
    name:'座標変更コピーを生成'
  }).click();
  const overlapLink=joinedCoordinates.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await overlapLink.waitFor({timeout:30000});
  const overlapDownload=page.waitForEvent('download');
  await overlapLink.click();
  const overlapCopy=readSyntheticEncryptedP1g(
    await readFile(await (await overlapDownload).path())
  );
  const overlapFull=overlapCopy.World.GridCollection.Grids['101'].Objects['1'];
  assert.deepEqual([overlapFull.X,overlapFull.Y,overlapFull.Orientation],
    [71,-18,'GridOrientation_Down']);
  assert.equal(overlapFull.PrivateState,'do-not-export');
  assert.equal(overlapCopy.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].Orientation,'GridOrientation_Left');
  assert.equal(quantityProfile.World.GridCollection.Grids['101']
    .Objects['1'].Orientation,'GridOrientation_Up');

  // A real Save can have far more than 256 distinct observed Grid positions.
  // Search must reach those later records without drawing all markers by
  // default. The selected positions remain visible and the existing Rust
  // optimistic batch writer still verifies the original immutable P1G.
  const manyOriginal=structuredClone(quantityProfile);
  const manyObjects=manyOriginal.World.GridCollection.Grids['101'].Objects;
  for(let i=3;i<=305;i++){
    manyObjects[String(i)]={
      ID:i,ItemID:i===305?30000031:40000001,
      X:45+i,Y:9+i,Orientation:'GridOrientation_Up',
      UnknownMarker:'preserve-'+i
    };
  }
  // A separate Full Grid intentionally repeats X/Y already used by other
  // local Grids. The UI must never infer a shared world coordinate system.
  manyOriginal.World.GridCollection.Grids['105']={
    ID:105,Objects:{
      '1':{ID:1,ItemID:600066777,X:-40,Y:70,
        Orientation:'GridOrientation_Right',
        UnknownMarker:'keep-cross-grid'}
    }
  };
  await page.getByLabel('検証用セーブファイル').setInputFiles({
    name:'grid-search-over-256.profile',mimeType:'application/octet-stream',
    buffer:syntheticEncryptedP1g(manyOriginal)
  });
  await page.getByRole('button',{name:'所持アイテムを表示'}).click();
  await page.getByRole('region',{name:'セーブ内アイテム'})
    .getByRole('status').filter({hasText:'件'}).waitFor({timeout:30000});
  await objects.getByRole('button',{name:'配置オブジェクトを表示'}).click();
  await objects.getByRole('status').filter({hasText:'307件'})
    .waitFor({timeout:30000});
  const manyMap=objects.getByRole('region',{name:'セーブ内Grid配置マップ'});
  const search= manyMap.getByRole('searchbox',{
    name:'マップ内の配置を検索'
  });
  assert.equal(await manyMap.locator('.marker').count(),256,
    'the default DOM must remain capped at 256 coordinate markers');
  await search.fill('#300');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #300 を選択'
    }).click();
  assert.equal(await manyMap.locator('.marker').count(),257);
  assert.equal(await manyMap.locator(
    '.marker[aria-label="配置 #300 をマップから選択"]'
  ).count(),1);
  const lateEditor=objects.getByLabel('座標編集',{exact:true});
  const x300=Number(await lateEditor.getByLabel('新しいX').inputValue());
  const y300=Number(await lateEditor.getByLabel('新しいY').inputValue());
  const original300=Object.values(manyObjects).find(value=>
    value.X===x300&&value.Y===y300);
  assert.ok(original300,
    'the returned ephemeral ordinal must resolve to an original object');
  // Local ordinals are never Save-native object IDs. Discover ordinal #305
  // from the browser projection, not by assuming object key "305".
  await search.fill('#305');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #305 を選択'
    }).click();
  const x305=Number(await lateEditor.getByLabel('新しいX').inputValue());
  const y305=Number(await lateEditor.getByLabel('新しいY').inputValue());
  const original305=Object.values(manyObjects).find(value=>
    value.X===x305&&value.Y===y305);
  assert.ok(original305&&original305.ID!==original300.ID);
  assert.equal(await manyMap.locator('.marker').count(),257);
  // Cross-Grid search does not require choosing its local Grid first.
  // The result must include the type and local Grid ordinal, then jump.
  await search.fill('600066777');
  const crossHit=manyMap.getByRole('group',{
    name:'マップ配置検索結果'
  }).getByRole('button',{
    name:'検索結果: 配置 #306 を選択'
  });
  assert.match(await crossHit.innerText(),/通常Grid/);
  assert.match(await crossHit.innerText(),/ローカル #2/);
  await crossHit.click();
  assert.equal(await manyMap.getByLabel('表示するセーブGrid')
    .inputValue(),'2');
  assert.equal(await manyMap.locator('.marker').count(),1);
  assert.equal(await lateEditor.getByLabel('新しいX').inputValue(),'-40');
  assert.equal(await lateEditor.getByLabel('新しいY').inputValue(),'70');

  // Switching across Grids during group selection must discard all previous
  // members; a combined group may NEVER mix saved local Grids.
  await manyMap.getByLabel('表示するセーブGrid').selectOption('1');
  await manyMap.getByRole('button',{name:'複数配置を一括移動'}).click();
  await search.fill('#300');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #300 をグループに追加または除外'
    }).click();
  await search.fill('#306');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #306 をグループに追加または除外'
    }).click();
  assert.equal(await manyMap.getByLabel('表示するセーブGrid')
    .inputValue(),'2');
  assert.match(await manyMap.getByRole('group',{
    name:'グループ座標移動'
  }).innerText(),/選択 1 \/ 16件/);
  assert.equal(await manyMap.locator('.marker.selected').count(),1);
  assert.equal(await manyMap.getByRole('button',{
    name:'選択した1件を座標編集に追加'
  }).isDisabled(),true);
  await manyMap.getByLabel('表示するセーブGrid').selectOption('1');
  await manyMap.getByRole('button',{name:'複数配置を一括移動'}).click();
  await search.fill('#300');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #300 をグループに追加または除外'
    }).click();
  await search.fill('#305');
  await manyMap.getByRole('group',{name:'マップ配置検索結果'})
    .getByRole('button',{
      name:'検索結果: 配置 #305 をグループに追加または除外'
    }).click();
  assert.equal(await manyMap.locator('.marker').count(),258,
    'both late search results must remain visible as selected markers');
  assert.match(await manyMap.getByRole('group',{
    name:'グループ座標移動'
  }).innerText(),/選択 2 \/ 16件/);
  await manyMap.getByLabel('グループ移動X').fill('7');
  await manyMap.getByLabel('グループ移動Y').fill('-4');
  await manyMap.getByRole('button',{
    name:'選択した2件を座標編集に追加'
  }).click();
  const lateBatch=objects.getByLabel('一括座標編集');
  await lateBatch.getByText('2 / 16件').waitFor();
  assert.equal(await manyMap.locator('.queued-ghost').count(),2);
  await lateBatch.getByRole('button',{
    name:'一括座標変更を検証'
  }).click();
  await lateEditor.getByRole('status').filter({
    hasText:'2件の座標変更をRust/WASMで検証しました'
  }).waitFor({timeout:30000});
  page.once('dialog',dialog=>dialog.accept());
  await lateEditor.getByRole('button',{
    name:'座標変更コピーを生成'
  }).click();
  const lateLink=lateEditor.getByRole('link',{
    name:'座標コピーをダウンロード'
  });
  await lateLink.waitFor({timeout:30000});
  const lateDownload=page.waitForEvent('download');
  await lateLink.click();
  const lateCopy=readSyntheticEncryptedP1g(
    await readFile(await (await lateDownload).path())
  );
  const lateObjects=lateCopy.World.GridCollection.Grids['101'].Objects;
  const changed300=lateObjects[String(original300.ID)];
  const changed305=lateObjects[String(original305.ID)];
  assert.deepEqual([changed300.X,changed300.Y],[x300+7,y300-4]);
  assert.deepEqual([changed305.X,changed305.Y],[x305+7,y305-4]);
  assert.equal(changed300.UnknownMarker,'preserve-'+original300.ID);
  assert.equal(changed305.UnknownMarker,'preserve-'+original305.ID);
  assert.equal(lateObjects['303'].UnknownMarker,'preserve-303');
  assert.equal(lateObjects['303'].X,348);
  assert.equal(lateCopy.World.GridCollection.DiffGrids['102']
    .ModifiedObjects['6'].X,-12);
  assert.equal(lateCopy.World.GridCollection.Grids['105']
    .Objects['1'].UnknownMarker,'keep-cross-grid');
  assert.deepEqual([
    lateCopy.World.GridCollection.Grids['105'].Objects['1'].X,
    lateCopy.World.GridCollection.Grids['105'].Objects['1'].Y
  ],[-40,70]);
  assert.equal(lateCopy.Player.ListInventories['100'].Inventory['550'].Amount,7);
  assert.equal(manyObjects[String(original300.ID)].X,x300);
  assert.equal(manyObjects[String(original305.ID)].Y,y305);

  assert.deepEqual(errors,[],errors.join('\n'));
  await page.close();
  console.log('DB-05 browser: explicit JSON/P1G edited-copy downloads, native reopen, stale rejection, original preservation PASS');
}finally{
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
