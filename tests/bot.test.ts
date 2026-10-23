import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../server/game.js';
import {chooseBotAction} from '../server/bot.js';
test('AI completes 2, 6, 15 player games with all effects and conservation',()=>{
 for(const n of [2,6,15])for(let run=0;run<30;run++){
  const g=new Game(Array.from({length:n},(_,i)=>({id:String(i),name:'AI '+i})));
  let steps=0;
  while(!g.ended&&steps++<20000){const p=g.prompt;if(p?.kind==='reveal')g.tick(g.deadline+1);else if(p){const hand=g.players.find(x=>x.id===p.actor)!.hand;const key=chooseBotAction(p,hand);assert.ok(p.choices.some(c=>c.key===key));g.act(p.actor,key,p.revision);}else g.startTurn();g.validate();}
  assert.ok(g.ended,'AI game must finish');
 }
});
test('AI picks a publicly revealed matching card and gives away joker',()=>{
 const hand=[{id:'a',suit:'♠',rank:3},{id:'j',suit:'★',rank:0}];
 const base={actor:'bot',revision:1,message:''};
 assert.equal(chooseBotAction({...base,kind:'draw',choices:[{key:'opaque1',label:'draw',card:{id:'b',suit:'♥',rank:3}},{key:'opaque2',label:'draw',card:{id:'c',suit:'♣',rank:8}}]},hand),'opaque1');
 assert.equal(chooseBotAction({...base,kind:'give',choices:hand.map(c=>({key:c.id,card:c,label:'give'}))},hand),'j');
});
