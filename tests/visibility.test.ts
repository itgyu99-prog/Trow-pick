import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game,deck} from '../server/game.js';
import {publiclyVisibleHand,visibleDrawScene} from '../server/visibility.js';

test('Opening Night shows only the effect user and closes after two seconds',()=>{
 const g=new Game(Array.from({length:3},(_,i)=>({id:String(i),name:'Player '+i})));
 const hands=[['♠1','♠2'],['♥3','♥4'],['♣5','JOKER_1']];
 g.players.forEach((p,i)=>{p.hand=hands[i].map(id=>deck().find(c=>c.id===id)!);p.rank=undefined;});
 g.discard=deck().filter(c=>!hands.flat().includes(c.id));g.turn=0;g.direction=1;
 const index=g.trows.findIndex(t=>t.effect===14);g.trows.push(...g.trows.splice(index,1));g.startTurn();
 assert.equal(publiclyVisibleHand(g,'0'),undefined);
 g.act('0','reveal',g.prompt!.revision);
 assert.equal(g.prompt?.kind,'reveal');assert.equal(g.revealing,true);
 assert.deepEqual(publiclyVisibleHand(g,'0'),g.players[0].hand);
 assert.equal(publiclyVisibleHand(g,'1'),undefined);assert.equal(publiclyVisibleHand(g,'2'),undefined);
 assert.throws(()=>g.act('0','ok',g.prompt!.revision));
 g.tick(g.deadline-1);assert.equal(g.revealing,true);
 g.tick(g.deadline+1);assert.equal(g.revealing,false);assert.equal(publiclyVisibleHand(g,'0'),undefined);
 assert.equal(g.prompt?.kind,'draw');assert.equal(g.prompt?.target,'1');g.validate();
});

function setupDraw(effect:number){const g=new Game(Array.from({length:3},(_,i)=>({id:String(i),name:'Player '+i})));const hands=[['♠1','♣2'],['♥1','♦4','JOKER_1'],['♣5','♦6']];g.players.forEach((p,i)=>{p.hand=hands[i].map(id=>deck().find(c=>c.id===id)!);p.rank=undefined;});g.discard=deck().filter(c=>!hands.flat().includes(c.id));g.turn=0;g.direction=1;const index=g.trows.findIndex(t=>t.effect===effect);g.trows.push(...g.trows.splice(index,1));g.startTurn();g.act('0','reveal',g.prompt!.revision);return g;}
test('all viewers see the same fan positions but only the drawer sees exposed faces',()=>{const g=setupDraw(0);g.act('0','0',g.prompt!.revision);const actor=visibleDrawScene(g,'0')!,observer=visibleDrawScene(g,'2')!;assert.equal(actor.target,'1');assert.equal(observer.actor,'0');assert.equal(observer.choices.length,actor.choices.length);assert.ok(actor.choices.every(c=>c.card));assert.ok(observer.choices.every(c=>c.card===undefined&&c.glow===undefined));assert.deepEqual(observer.choices.map(c=>c.key),actor.choices.map(c=>c.key));assert.ok(observer.choices.every(c=>/^\d+$/.test(c.key)));assert.throws(()=>g.act('2',g.prompt!.choices[0].key,g.prompt!.revision));});
test('glow hints stay private, and the selected position remains visible without faces',()=>{const g=setupDraw(5);assert.ok(visibleDrawScene(g,'0')!.choices.some(c=>c.glow));assert.ok(visibleDrawScene(g,'2')!.choices.every(c=>c.glow===undefined));const revision=g.prompt!.revision;g.act('0',g.prompt!.choices[1].key,revision);const held=visibleDrawScene(g,'2')!;assert.equal(held.selected,'1');assert.equal(held.revision,revision);assert.ok(held.choices.every(c=>c.card===undefined&&c.glow===undefined));assert.equal(g.draws.at(-1)!.position,'1');assert.equal(g.draws.at(-1)!.revision,revision);g.drawScene!.expires=Date.now()-1;assert.equal(visibleDrawScene(g,'2'),null);g.validate();});
