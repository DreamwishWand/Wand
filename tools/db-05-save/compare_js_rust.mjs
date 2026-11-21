/**
 * CI-only JS ↔ Rust parity for 14 immutable DB-05 public reference rules.
 * No owner save is accessed or logged; all documents are synthetic.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { probeSaveReferences } from '../../src/lib/save/references.mjs';

function fixture(version=643) {
  return {
    GameInfo:{Version:version},
    Player:{ContainerInventories:{
      '31':{ID:31,Inventory:[{ItemID:40000001,Amount:1}]},
      '32':{ID:32,Inventory:[]}
    }},
    World:{
      GridCollection:{
        Grids:{
          '0':{ID:0,Objects:{'7':{
            ID:7,State:{Storage:{ContainerInventoryID:31},SubGrid:{GridID:20}}
          }}},
          '10':{ID:10,Objects:{'8':{
            ID:8,State:{Storage:{ContainerInventoryID:32},SubGrid:{GridID:0}}
          }}}
        },
        DiffGrids:{'20':{ID:20,ModifiedObjects:{'9':{
          ID:9,State:{Storage:{ContainerInventoryID:31},SubGrid:{GridID:10}}
        }}}}
      },
      PlayerHouses:[{Floors:[{Rooms:{
        '1':{FloorGridID:10,WallGridIDs:{'1':0,'2':20}}
      }}]}],
      BuildingInfos:{'5':{GridIDs:{List:[0,20]}}},
      Villages:[{Areas:{'7':{GridIDs:[0,10,20]}}}],
      FloatingIslands:{'8':{GridIDs:[20,0]}}
    }
  };
}

const valid626=fixture(626);
const valid643=fixture(643);

const mixed=fixture();
mixed.Player.ContainerInventories['32'].ID=33;
mixed.World.GridCollection.Grids['10'].Objects['8'].ID=7;
mixed.World.GridCollection.Grids['0'].Objects['7'].State.Storage.ContainerInventoryID=99999;
mixed.World.PlayerHouses[0].Floors[0].Rooms['1'].FloorGridID=777;

const missing=fixture();
delete missing.Player.ContainerInventories;
delete missing.World.GridCollection.DiffGrids;
const unknown=fixture();
unknown.Player.ContainerInventories['PRIVATE_KEY_TEST']={ID:51};
unknown.World.GridCollection.Grids['10'].Objects['PRIVATE_OBJECT']={
  ID:17,State:{Storage:{ContainerInventoryID:null}}
};

const malformed=fixture();
malformed.World.GridCollection.Grids['10'].Objects['8'].State.SubGrid.GridID='20';
malformed.World.BuildingInfos['5'].GridIDs.List='NOT_AN_ARRAY';
malformed.World.Villages[0].Areas['7'].GridIDs=['0',10,20];

const capped=fixture();
for(let i=100;i<4300;i++) capped.Player.ContainerInventories[String(i)]={ID:i};

const cases=[
  {name:'schema626',value:valid626},
  {name:'schema643',value:valid643},
  {name:'broken-identities-and-links',value:mixed},
  {name:'missing-target-index',value:missing},
  {name:'malformed-map-keys',value:unknown},
  {name:'malformed-field-types',value:malformed},
  {name:'sampled-traversal',value:capped},
  {name:'invalid-root',value:{GameInfo:{Version:643},Player:[],World:{}}}
];
const source = cases.map(x=>JSON.stringify(x.value)).join('\n')+'\n';
const proc=spawnSync('cargo',[
  'run','--quiet','--manifest-path','crates/ddv-save-schema/Cargo.toml',
  '--example','reference_probe'
],{input:source,encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
assert.equal(proc.error,undefined,'Rust parity example failed to launch');
assert.equal(proc.status,0,'Rust parity example failed');
const lines=proc.stdout.trimEnd().split('\n');
assert.equal(lines.length,cases.length,'One redacted Rust report expected per synthetic fixture');
for(let i=0;i<cases.length;i++){
  const rust=JSON.parse(lines[i]);
  const js=probeSaveReferences(cases[i].value);
  assert.deepEqual(rust,js,"Rust/JS reference report divergence for synthetic "+cases[i].name);
  assert.equal(rust.referenceClosureVerified,false);
  assert.equal(rust.writerAuthorized,false);
  assert.equal(rust.exportAuthorized,false);
  // Numeric test values and private test keys cannot enter a public report.
  for(const privateText of ['PRIVATE_KEY_TEST','PRIVATE_OBJECT','40000001','99999','777'])
    assert.equal(lines[i].includes(privateText),false);
}
process.stdout.write('DB-05 Rust/JS redacted reference parity PASS: '+cases.length+' synthetic fixtures, 14 rules\n');
