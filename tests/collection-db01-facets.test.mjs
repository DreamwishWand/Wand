import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  COLLECTION_DB01_FACETS_SCHEMA,COLLECTION_DB01_ARCHIVE_SHA,
  parseCollectionDb01Facets,collectionDb01Groups,collectionDb01Matches,
  collectionDb01FacetLabel
} from '../src/lib/collection/db01-native-facets.ts';

test('DB-01 source native filtering is a narrow projection, not a second Item master',async()=>{
  // npm pretest regenerates this from the pinned, published Item master ZIP.
  const file=join(process.cwd(),'static/ddv/collection/db01-facets-1262.json');
  const raw=JSON.parse(await readFile(file,'utf8'));
  assert.equal(raw.schema,COLLECTION_DB01_FACETS_SCHEMA);
  assert.equal(raw.sourceArchiveSha256,COLLECTION_DB01_ARCHIVE_SHA);
  assert.equal(raw.sourceItemCount,13202);
  assert.ok(raw.taggedItems>1000,'source tags must cover real Item IDs');
  assert.equal(Object.hasOwn(raw,'names'),false);
  assert.equal(Object.hasOwn(raw,'iconGuid'),false);
  assert.equal(Object.hasOwn(raw,'collectionSourceCandidates'),false);
  const index=parseCollectionDb01Facets(raw);
  assert.equal(index.taggedItems,raw.taggedItems);
  const shoe=index.byItem.get(40005160);
  assert.ok(shoe,'Glass Shoe must have native filter tags');
  assert.ok(shoe.some(([facet,key])=>facet==='color'&&key==='White'));
  assert.equal(collectionDb01Matches(index,40005160,'color','White'),true);
  assert.equal(collectionDb01Matches(index,40005160,'color','Pink'),false);
  const groups=collectionDb01Groups(index,[40005160,40005160]);
  assert.equal(groups.find(x=>x.facet==='color').options.find(x=>x.key==='White').count,1,
    'repeated category Item IDs must be deduplicated before count');
  assert.equal(collectionDb01FacetLabel('ja','color'),'色');
});

test('source browse index refuses invented availability, reordered IDs and unreviewed tags',()=>{
  const fixture={
    schema:COLLECTION_DB01_FACETS_SCHEMA,
    release:'steam-1.26.2-item-id-master-v1',
    sourceArchiveSha256:COLLECTION_DB01_ARCHIVE_SHA,
    sourceItemCount:13202,
    taggedItems:2,
    items:[[100,[['color','White']]],[200,[['furnitureStyle','F_Elegant']]]]
  };
  const index=parseCollectionDb01Facets(fixture);
  assert.equal(index.byItem.size,2);
  assert.equal(collectionDb01Matches(index,200,'furnitureStyle','F_Elegant'),true);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,items:[fixture.items[1],fixture.items[0]]}),
    /INVALID_ROW/);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,items:[[100,[['worldAvailability','DreamlightValley']]]]}),
    /INVALID_MANIFEST|INVALID_ROW/);
  assert.throws(()=>parseCollectionDb01Facets({...fixture,sourceItemCount:200}),
    /INVALID_MANIFEST/);
});