import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_SCHEMA, createWorldCatalog, getNativeFootprint, getNativeScene,
  getLayoutGridReferences, checkNativeEditRestriction, assessPlacement,
} from '../src/lib/world/catalog.mjs';

function fixture() {
  return {
    manifest: { schema: WORLD_SCHEMA, status: 'partial_game_native_evidence', gameVersion: '1.26.2' },
    objects: [{
      itemId: 40000001, nativeType: 'Furniture', nativeName: 'Bench',
      footprint: { sizeX: 2, sizeY: 1, layerValues: [68, 76],
        acceptedFloorTypesFlag: 2048,
        cellIndexToXYVerified: false, layerMaskSemanticsVerified: false },
      gridEditRestrictions: { canMove: { value: false, nativeWireField: '25.1.1' } },
    }],
    scenes: [{ sceneId: 1540000000, nativeName: 'Village!Village04', parentWorldId: null }],
    grids: [{ gridId: 'GridData/Villages/Meadow.json', terrainFlagsVerified: false }],
    layouts: [{ layoutId: 'SceneLayouts/Village04/Main.json',
      gridReferences: [{ path: 'GridData/Villages/Meadow.json', wireField: '1.2' }] }],
    unresolved: { unknownSemantics: ['terrain'] },
  };
}

test('native footprint is copied without supplying guessed 2D cell coordinates', () => {
  const catalog = createWorldCatalog(fixture());
  const footprint = getNativeFootprint(catalog, 40000001);
  assert.equal(footprint.sizeX, 2);
  assert.deepEqual(footprint.layerValues, [68, 76]);
  footprint.layerValues[0] = 99;
  assert.equal(getNativeFootprint(catalog, 40000001).layerValues[0], 68);
  assert.equal(footprint.cellIndexToXYVerified, false);
});

test('explicit restrictions deny but missing flags never authorize placement', () => {
  const catalog = createWorldCatalog(fixture());
  assert.equal(checkNativeEditRestriction(catalog, 40000001, 'canMove').status, 'denied_by_native_flag');
  assert.equal(checkNativeEditRestriction(catalog, 40000001, 'canRotate').status, 'unresolved');
  assert.equal(checkNativeEditRestriction(catalog, 999, 'canMove').status, 'unknown_item');
  assert.equal(assessPlacement(catalog, 40000001, { x: 1, y: 2 }).status, 'unresolved');
  assert.equal(assessPlacement(catalog, 40000001, {}).status, 'unresolved');
});

test('scene IDs and native layout references are not conflated with map geometry', () => {
  const catalog = createWorldCatalog(fixture());
  assert.equal(getNativeScene(catalog, 1540000000).nativeName, 'Village!Village04');
  assert.deepEqual(getLayoutGridReferences(catalog, 'SceneLayouts/Village04/Main.json'), [{
    path: 'GridData/Villages/Meadow.json', wireField: '1.2', knownGrid: true,
  }]);
});

test('invalid snapshots and silently inferred occupancy are rejected', () => {
  const data = fixture();
  data.objects[0].footprint.cellIndexToXYVerified = true;
  assert.throws(() => createWorldCatalog(data), /Unverified/);
  const other = fixture();
  other.objects.push({ ...other.objects[0] });
  assert.throws(() => createWorldCatalog(other), /Duplicate/);
  const bad = fixture();
  bad.manifest.schema = 'other';
  assert.throws(() => createWorldCatalog(bad), /Unsupported/);
});
