import test from 'node:test';
import assert from 'node:assert/strict';
import { indexItemRecords, getLocalizedName, getVerifiedIconGuid,
  isNativeItem, getHistoricalCollectionMetadata } from './records.mjs';

const record = {
  itemId: 30000031, catalogDomain: 'item', source: { platform: 'Steam', gameVersion: '1.26.2',
    file: 'itemlist/ActivityItem.json', sha256: 'a'.repeat(64) },
  names: { en: 'Amethyst', ja: null }, image: { iconGuid: 'guid:' + 'a'.repeat(32) },
  verification: { currentVersionObserved: true, names: { en: 'exact_locdb_join', ja: 'unresolved' },
    iconGuid: 'native_wire_verified' }, historicalReference: { category: 'Gems' },
};

test('index requires unique safe IDs and evidence', () => {
  assert.equal(indexItemRecords([record]).get(30000031), record);
  assert.throws(() => indexItemRecords([record, record]), /duplicate/);
  assert.throws(() => indexItemRecords([{ ...record, source: {} }]), /source evidence/);
});
test('names never invent translations and fallback is explicit', () => {
  assert.equal(getLocalizedName(record, 'en'), 'Amethyst');
  assert.equal(getLocalizedName(record, 'ja'), null);
  assert.equal(getLocalizedName(record, 'ja', { fallback: 'en' }), 'Amethyst');
  assert.throws(() => getLocalizedName(record, 'xx'), RangeError);
});
test('verified GUID, native domain and history stay distinct', () => {
  assert.equal(getVerifiedIconGuid(record), record.image.iconGuid);
  assert.equal(getVerifiedIconGuid({ ...record, verification: { iconGuid: 'unresolved' } }), null);
  assert.equal(isNativeItem(record), true);
  assert.equal(isNativeItem({ ...record, catalogDomain: 'definition_unclassified' }), false);
  assert.equal(getHistoricalCollectionMetadata(record).category, 'Gems');
});