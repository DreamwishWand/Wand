import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dialogFocus} from '../src/lib/ui/dialog-focus.ts';

class Element {
  constructor(name,children=[]){
    this.name=name;this.children=children;this.isConnected=true;this.visible=true;
    this.listeners=new Map();this.tabIndex=0;
  }
  querySelectorAll(){return this.children;}
  getClientRects(){return this.visible?[{}]:[];}
  getAttribute(){return null;}
  contains(element){return element===this||this.children.includes(element);}
  focus(){globalThis.document.activeElement=this;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  removeEventListener(name){this.listeners.delete(name);}
  keyDown(key,shiftKey=false){
    const event={key,shiftKey,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
    this.listeners.get('keydown')?.(event);
    return event;
  }
}

function withDom(run){
  const priorDocument=globalThis.document;
  const priorElement=globalThis.HTMLElement;
  const body=new Element('body');
  globalThis.document={body,activeElement:body};
  globalThis.HTMLElement=Element;
  return Promise.resolve().then(run).finally(()=>{
    if(priorDocument===undefined)delete globalThis.document;
    else globalThis.document=priorDocument;
    if(priorElement===undefined)delete globalThis.HTMLElement;
    else globalThis.HTMLElement=priorElement;
  });
}

test('shell dialog traps Tab at both ends and restores the launcher focus',()=>withDom(async()=>{
  const opener=new Element('history-button');
  const first=new Element('close');
  const middle=new Element('undo');
  const last=new Element('timeline');
  const panel=new Element('dialog',[first,middle,last]);
  opener.focus();
  const action=dialogFocus(panel);
  assert.equal(document.activeElement,first);
  assert.equal(panel.tabIndex,-1);
  assert.equal(panel.keyDown('Tab',true).defaultPrevented,true);
  assert.equal(document.activeElement,last);
  assert.equal(panel.keyDown('Tab').defaultPrevented,true);
  assert.equal(document.activeElement,first);
  middle.focus();
  assert.equal(panel.keyDown('Tab').defaultPrevented,false);
  action?.destroy?.();
  await Promise.resolve();
  assert.equal(document.activeElement,opener);
}));

test('dialog returns to compact More button when its menu launcher has unmounted',()=>withDom(async()=>{
  const removedMenuItem=new Element('menu-item');
  const moreButton=new Element('more');
  const close=new Element('close');
  const panel=new Element('dialog',[close]);
  removedMenuItem.focus();
  const action=dialogFocus(panel,{fallback:()=>moreButton});
  removedMenuItem.isConnected=false;
  action?.destroy?.();
  await Promise.resolve();
  assert.equal(document.activeElement,moreButton);
}));

test('dialog with no actionable children keeps focus in its panel',()=>withDom(async()=>{
  const panel=new Element('empty-panel');
  const action=dialogFocus(panel);
  assert.equal(document.activeElement,panel);
  assert.equal(panel.keyDown('Tab').defaultPrevented,true);
  action?.destroy?.();
  await Promise.resolve();
}));

test('history and account dialogs retain focus; guided tour uses the same action in its own component',()=>{
  const layout=readFileSync(new URL('../src/routes/+layout.svelte',import.meta.url),'utf8');
  const tour=readFileSync(new URL('../src/lib/ui/GuidedTour.svelte',import.meta.url),'utf8');
  assert.equal((layout.match(/use:dialogFocus=/g)??[]).length,2);
  assert.match(layout,/class="shell-history-panel"[^>]+use:dialogFocus=/);
  assert.match(layout,/aria-label=\{copy.account\}[^>]+use:dialogFocus=/);
  assert.match(layout,/<GuidedTour title=\{tutorial.title\}/);
  assert.match(layout,/onClose=\{closeTutorial\}/);
  assert.match(tour,/use:dialogFocus=\{\{fallback:focusReturn\}\}/);
  assert.match(layout,/class="tutorial-done" on:click=\{closeAccount\}/);
});
