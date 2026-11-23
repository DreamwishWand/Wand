import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {
  localSaveSession,selectLocalSaveFile,closeLocalSaveFile,
  registerLocalSaveChangeGuard,isCurrentLocalSaveSelection
} from '../src/lib/ui/local-save-session.ts';

test('shared Save guard blocks every session change BEFORE any subscriber sees it',()=>{
  const first=new File(['synthetic'], 'original.profile');
  const second=new File(['synthetic2'], 'replacement.profile');
  let state;
  const observations=[];
  const unsubscribe=localSaveSession.subscribe(next=>{
    state=next;
    observations.push(next);
  });
  assert.equal(selectLocalSaveFile(first),true);
  const initialRevision=state.revision;
  let allow=false;
  const proposals=[];
  const unregister=registerLocalSaveChangeGuard((previous,next)=>{
    proposals.push({previous,next});
    return allow;
  });
  try{
    assert.throws(()=>registerLocalSaveChangeGuard(()=>true),
      /LOCAL_SAVE_GUARD_ALREADY_REGISTERED/);
    assert.equal(selectLocalSaveFile(second),false);
    assert.equal(closeLocalSaveFile(),false);
    assert.equal(state.file,first);
    assert.equal(state.revision,initialRevision);
    assert.equal(observations.length,2,
      'rejected selections must not notify Collection or Save Editor');
    assert.deepEqual(proposals,[
      {previous:first,next:second},{previous:first,next:null}
    ]);
    assert.equal(isCurrentLocalSaveSelection(initialRevision,first),true);
    // Selecting the same File cannot destroy the user's draft.
    assert.equal(selectLocalSaveFile(first),true);
    assert.equal(state.revision,initialRevision);
    assert.equal(proposals.length,2);
    allow=true;
    assert.equal(selectLocalSaveFile(second),true);
    assert.equal(state.file,second);
    assert.notEqual(state.revision,initialRevision);
  }finally{
    unregister();
  }
  assert.equal(closeLocalSaveFile(),true,
    'unmounting the editor must release the guard for all other services');
  assert.equal(state.file,null);
  unsubscribe();
});
