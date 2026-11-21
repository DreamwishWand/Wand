import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { openLocalWorldZip } from '../src/lib/world/local-snapshot.mjs';
import { getNativeDefaultLayoutAnchorWindow } from '../src/lib/world/catalog.mjs';

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function sourceFiles(gameVersion='1.26.2') {
  const layout = 'SceneLayouts/Village04/A.json';
  const rows = {
    objects: [{ itemId: 100, nativeType: 'Furniture',
      nativeName: 'SourceBench', footprint: null }],
    scenes: [],
    worlds: [],
    areas: [],
    grids: [{gridId: 'GridData/Rooms/TestRoom.json', sizeX: 8, sizeY: 8,
      terrainDecoding: { decoded: false,
        status: 'native_packing_not_verified_for_game_version' }}],
    layouts: [{layoutId: layout, layoutKind: 'nativeGridCollection',
      nativeGridEntries: [{
        gridIdNative: 0, gridDataPath: 'GridData/Rooms/TestRoom.json',
        defaultObjectCount: 1,
      }], defaultObjectCount: 1}],
    layoutObjects: [{ layoutObjectId: layout + '#grid=0#object=7',
      layoutId: layout, gridIdNative: 0, gridObjectIdNative: 7, itemId: 100,
      x: 4, y: 4, orientationCode: 0,
      worldCoordinatesVerified: false, fixedImmovableVerified: false }],
  };
  const entries = new Map(Object.entries(rows).map(([key, value]) =>
    [key + '.json', Buffer.from(JSON.stringify(value))]));
  entries.set('report.json', Buffer.from('{"status":"native_partial_world_extraction"}'));
  const hashes = Object.fromEntries([...entries].map(([name, content]) =>
    [name, sha(content)]));
  const manifest = {
    schema: 'wand.db04.world@1',
    status: 'partial_game_native_evidence',
    platform: 'Steam', gameVersion,
    sourceScopeVerified: false,
    outputSha256: hashes,
  };
  return {entries, manifest};
}

function createZip(files, {method=8, zip64Local=false}={}) {
  let length = 0;
  const localChunks = [];
  const centralChunks = [];
  for (const [name, content] of files) {
    const bytes = Buffer.from(content);
    const nameBytes = Buffer.from(name);
    const compressed = method === 8 ? deflateRawSync(bytes) : bytes;
    const extra = zip64Local ? Buffer.alloc(20) : Buffer.alloc(0);
    if (zip64Local) {
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(16, 2);
      extra.writeBigUInt64LE(BigInt(bytes.length), 4);
      extra.writeBigUInt64LE(BigInt(compressed.length), 12);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(zip64Local ? 45 : 20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(zip64Local ? 0xffffffff : compressed.length, 18);
    local.writeUInt32LE(zip64Local ? 0xffffffff : bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(extra.length, 28);
    localChunks.push(local, nameBytes, extra, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(length, 42);
    centralChunks.push(central, nameBytes);
    length += local.length + nameBytes.length + extra.length + compressed.length;
  }
  const centralSize = centralChunks.reduce((n, x) => n + x.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(length, 16);
  return Buffer.concat([...localChunks, ...centralChunks, end]);
}
function sampleZip({gameVersion='1.26.2',alter=null,zip64Local=false,method=8}={}) {
  const {entries, manifest} = sourceFiles(gameVersion);
  if (alter) alter(entries, manifest);
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  entries.set('diagnostics/verification.json',
    Buffer.from('{"status":"integrity_verified_not_placement_verified"}'));
  return new Blob([createZip(entries, {method, zip64Local})]);
}

test('browser-local zipped private world source loads without interpreting unknown terrain', async () => {
  for (const method of [0, 8]) {
    for (const zip64Local of [false, true]) {
      const view = await openLocalWorldZip(sampleZip({method,zip64Local}));
      assert.equal(view.gameVersion, '1.26.2');
      assert.equal(view.platform, 'Steam');
      assert.equal(view.originalSourceAuthenticated, false);
      assert.equal(view.privateDataUploaded, false);
      assert.match(view.integrity, /self_consistent_not_original_source_authenticated/);
      assert.equal(view.manifestFilesVerified, 8);
      const anchors = getNativeDefaultLayoutAnchorWindow(view.catalog,
        'SceneLayouts/Village04/A.json', 0,
        {x: 2, y: 2, width: 4, height: 4});
      assert.equal(anchors.status, 'source_native_default_layout_anchors_only');
      assert.equal(anchors.viewAnchorCount, 1);
      assert.deepEqual([anchors.defaultObjectAnchors[0].x,
        anchors.defaultObjectAnchors[0].y], [4, 4]);
      assert.equal(anchors.placementLegalityVerified, false);
      assert.equal(anchors.terrainDecoded, false);
    }
  }
});

test('local ZIP fails closed when an output hash is inconsistent', async () => {
  const zip = sampleZip({alter(entries) {
    const grid = JSON.parse(entries.get('grids.json').toString());
    grid[0].sizeX = 128;  // Do not update declared SHA.
    entries.set('grids.json', Buffer.from(JSON.stringify(grid)));
  }});
  await assert.rejects(openLocalWorldZip(zip), /SHA-256 mismatch/);
});

test('local ZIP rejects forged manifest version or missing/mismatching members', async () => {
  await assert.rejects(openLocalWorldZip(sampleZip({gameVersion:'v1.26.2'})),
    /invalid DB-04 manifest/);
  await assert.rejects(openLocalWorldZip(sampleZip({alter(entries) {
    entries.delete('objects.json');
  }})), /unregistered\/missing\/invalid manifest JSON member/);
  await assert.rejects(openLocalWorldZip(sampleZip({alter(entries) {
    entries.set('../malicious.json', Buffer.from('{}'));
  }})), /unexpected ZIP entry path/);
  await assert.rejects(openLocalWorldZip(sampleZip({alter(entries, manifest) {
    delete manifest.outputSha256['objects.json'];
  }})), /unexpected unregistered JSON/);
  await assert.rejects(openLocalWorldZip(sampleZip({alter(entries) {
    entries.set('objects.json', Buffer.from('not json'));
  }})), /SHA-256 mismatch/);
});

test('local ZIP refuses oversized declarations and invalid package formats', async () => {
  await assert.rejects(openLocalWorldZip(new Blob([Buffer.from('invalid')])),
    /invalid local ZIP file/);
  const raw = createZip(new Map([['manifest.json', Buffer.from('{}')]]));
  const broken = Buffer.from(raw);
  // Tamper with central entry's uncompressed size, beyond the 64-MiB limit.
  const centralPos = broken.readUInt32LE(broken.length - 6);
  broken.writeUInt32LE(65 * 1024 * 1024, centralPos + 24);
  await assert.rejects(openLocalWorldZip(new Blob([broken])),
    /unsupported or oversized ZIP member/);
});
