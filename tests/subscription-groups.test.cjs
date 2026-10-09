const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../extension/editions-core.js');
function setup(){
  const siblings=[];
  class Element {
    constructor(channel){this.attrs=new Set();this.listeners={};this.data={content:{videoWithContextRenderer:{shortBylineText:{runs:[{text:channel,navigationEndpoint:{browseEndpoint:{browseId:channel}}}]}}}};}
    matches(){return true;}
    toggleAttribute(name,value){if(value)this.attrs.add(name);else this.attrs.delete(name);}
    removeAttribute(name){this.attrs.delete(name);}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    get nextSibling(){return siblings[siblings.indexOf(this)+1];}
    after(node){node.remove();siblings.splice(siblings.indexOf(this)+1,0,node);}
    remove(){const i=siblings.indexOf(this);if(i>=0)siblings.splice(i,1);}
    click(){this.listeners.click({preventDefault(){},stopPropagation(){}});}
  }
  const context={SifiYouTubeEditionsCore:core,document:{createElement:()=>new Element()}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/subscription-groups.js'),'utf8'),context);
  const cards=['UCa','UCa','UCb','UCb'].map(id=>new Element(id));siblings.push(...cards);
  return {groups:new context.SifiYouTubeSubscriptionGroups(),cards,siblings};
}
test('disclosures expand only their channel and pagination hides all off-page members',()=>{
  const {groups,cards,siblings}=setup();
  groups.update(cards);groups.show(0,1);
  assert.equal(cards[0].attrs.size,0);
  assert.equal(cards[1].attrs.has('data-sifi-group-hidden'),true);
  assert.equal(cards[2].attrs.has('data-sifi-page-hidden'),true);
  const first=groups.buttons.get('UCa');first.click();
  assert.equal(cards[1].attrs.size,0);
  assert.equal(first['aria-expanded'],'true');
  groups.show(1,2);
  assert.equal(cards[1].attrs.has('data-sifi-page-hidden'),true);
  assert.equal(first.hidden,true);
  assert.equal(cards[2].attrs.size,0);
  assert.equal(cards[3].attrs.has('data-sifi-group-hidden'),true);
  groups.update(cards);groups.show(0,1);
  assert.equal(siblings.length,6);
  assert.equal(groups.buttons.get('UCa'),first);
  assert.equal(cards[1].attrs.size,0);
  first.click();assert.equal(cards[1].attrs.has('data-sifi-group-hidden'),true);
  groups.destroy();
  assert.equal(siblings.length,4);
  assert.equal(cards.some(c=>c.attrs.has('data-sifi-group-hidden')),false);
});
