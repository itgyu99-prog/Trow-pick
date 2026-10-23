import {randomInt,randomUUID} from 'node:crypto';
import {Card,Player,Prompt,Choice,RULES,TROWS} from '../shared/types.js';
export function shuffle<T>(a:T[]):T[]{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function deck():Card[]{return [...['♠','♥','♦','♣'].flatMap(suit=>Array.from({length:13},(_,i)=>({id:suit+(i+1),rank:i+1,suit}))),...['1'].map(n=>({id:'JOKER_'+n,rank:0,suit:'★'}))];}
const canonical=new Map(deck().map(c=>[c.id,c]));
export const pairable=(a:Card,b:Card)=>a.id!==b.id&&a.rank===b.rank&&(a.rank!==0||RULES.jokersPair);
export const comparisonValue=(c:Card)=>c.rank===0?RULES.jokerValue:c.rank;
export class Game {
 publicHands=new Set<string>();
 drawScene?:{prompt:Prompt;selected:string;expires:number};
 id=randomUUID();draws:{seq:number;from:string;to:string;revision:number;position:string;card:Card}[]=[];drawSeq=0;motionSeq=0;movements:{seq:number;from:string;to:string;revision:number;position:string;card:Card}[]=[];
 players:Player[];discard:Card[]=[];trows=shuffle(Array.from({length:TROWS.length*2},(_,i)=>({id:i,effect:Math.floor(i/2)})));used:{id:number;effect:number}[]=[];
 turn=0;direction=Math.random()<.5?1:-1;effect=-1;prompt:Prompt|null=null;revision=0;deadline=0;revealing=false;ended=false;logs:string[]=[];
 iterator:Generator<Prompt,void,string>|null=null;
 constructor(players:{id:string;name:string}[]){if(players.length<2||players.length>15)throw Error('2~15명이 필요해요.');this.players=players.map(p=>({...p,hand:[]}));shuffle(deck()).forEach((c,i)=>this.players[i%players.length].hand.push(c));this.clean();this.turn=randomInt(players.length);if(!this.alive().includes(this.current()))this.turn=this.players.indexOf(this.alive()[0]||this.players[0]);this.validate();}
 current(){return this.players[this.turn];}
 alive(){return this.players.filter(p=>p.rank===undefined&&p.hand.length>0);}
 next(p:Player,d=this.direction){const a=this.alive();let i=this.players.indexOf(p);for(let n=0;n<this.players.length;n++){i=(i+d+this.players.length)%this.players.length;if(a.includes(this.players[i]))return this.players[i];}return p;}
 log(s:string){this.logs=[s,...this.logs].slice(0,30);}
 transfer(from:Player,to:Player,id:string){const i=from.hand.findIndex(c=>c.id===id);if(i<0||from===to)throw Error('옮길 수 없는 카드입니다.');const [c]=from.hand.splice(i,1);to.hand.push(c);const prompt=this.prompt;this.movements.push({seq:++this.motionSeq,from:from.id,to:to.id,revision:prompt?.revision??this.revision,position:prompt?.kind==='draw'?String(prompt.choices.findIndex(x=>x.key===id)):'',card:c});return c;}
 swap(a:Player,ca:Card,b:Player,cb:Card){this.transfer(a,b,ca.id);this.transfer(b,a,cb.id);}
 matches(p:Player,c:Card){return p.hand.some(x=>pairable(x,c));}
 swapHands(a:Player,b:Player){[a.hand,b.hand]=[b.hand,a.hand];}
 redistribute(){const alive=this.alive(),cards=shuffle(alive.flatMap(x=>x.hand));alive.forEach(x=>x.hand=[]);cards.forEach((c,i)=>alive[i%alive.length].hand.push(c));}
 matchingCards(p:Player){if(p.blocked)return [];const result:Card[]=[];for(let rank=RULES.jokersPair?0:1;rank<=13;rank++){const cards=p.hand.filter(c=>c.rank===rank);result.push(...cards.slice(0,cards.length-cards.length%2));}return result;}
 removeConfirmedPairs(p:Player){const ids=new Set(this.matchingCards(p).map(c=>c.id));this.discard.push(...p.hand.filter(c=>ids.has(c.id)));p.hand=p.hand.filter(c=>!ids.has(c.id));}
 clean(){for(const p of this.players){if(p.blocked)continue;for(let rank=RULES.jokersPair?0:1;rank<=13;rank++){let cards=p.hand.filter(c=>c.rank===rank);while(cards.length>=2){const ids=cards.splice(0,2).map(c=>c.id);this.discard.push(...p.hand.filter(c=>ids.includes(c.id)));p.hand=p.hand.filter(c=>!ids.includes(c.id));}}}const rank=this.players.filter(p=>p.rank!==undefined).length+1;for(const p of this.players)if(!p.hand.length&&p.rank===undefined){p.rank=rank;this.log(`${p.name} 님 ${rank}위!`);} }
 validate(){const cards=[...this.discard,...this.players.flatMap(p=>p.hand)];if(cards.length!==canonical.size||new Set(cards.map(c=>c.id)).size!==canonical.size||cards.some(c=>{const x=canonical.get(c.id);return !x||x.rank!==c.rank||x.suit!==c.suit;}))throw Error('카드 보존 오류');const ts=[...this.trows,...this.used];if(ts.length!==TROWS.length*2||new Set(ts.map(t=>t.id)).size!==TROWS.length*2)throw Error('트로우 보존 오류');}
 terminal(){const a=this.alive();if(a.length<=1||a.every(p=>p.hand.every(c=>c.rank===0))){const rank=this.players.filter(p=>p.rank!==undefined).length+1;a.forEach(p=>p.rank=rank);this.ended=true;this.prompt=null;this.log('게임 종료! 다음 한 판에서 만나요.');return true;}return false;}
 *ask(actor:Player,kind:string,message:string,choices:Choice[],target?:string):Generator<Prompt,string,string>{return yield {actor:actor.id,kind,message,choices,revision:++this.revision,target};}
 *pick(actor:Player,target:Player,allowed?:Card[],show=false,glow=false):Generator<Prompt,Card|undefined,string>{if(target===actor||!target.hand.length)return;const cards=allowed||target.hand;const key=yield* this.ask(actor,'draw',`${target.name} 님의 카드를 골라주세요`,cards.map(c=>({key:c.id,label:'카드 뽑기',card:show?c:undefined,glow:glow&&(c.rank===0||this.matches(actor,c))})),target.id);this.drawScene={prompt:this.prompt!,selected:String(this.prompt!.choices.findIndex(c=>c.key===key)),expires:Date.now()+RULES.drawSceneMs};const card=this.transfer(target,actor,key);this.draws.push({seq:++this.drawSeq,from:target.id,to:actor.id,revision:this.drawScene.prompt.revision,position:this.drawScene.selected,card});this.draws=this.draws.slice(-64);return card;}
 *normal(p:Player):Generator<Prompt,Card|undefined,string>{return yield* this.pick(p,this.next(p));}
 exchange(p:Player,c:Card,predicate:(c:Card)=>boolean){const options=this.alive().filter(x=>x!==p).flatMap(owner=>owner.hand.filter(predicate).map(card=>({owner,card})));if(!options.length)return false;const {owner,card}=options[randomInt(options.length)];this.swap(p,c,owner,card);return true;}
 *run():Generator<Prompt,void,string>{const p=this.current();p.blocked=false;this.effect=-1;if(this.trows.length)yield* this.ask(p,'trow','이번 턴의 트로우 카드를 직접 뽑아주세요',[{key:'reveal',label:'트로우 카드 뽑기 ✦'}]);const t=this.trows.pop();this.effect=t?.effect??-1;if(t)this.used.push(t);this.log(`${p.name} · ${t?TROWS[t.effect][0]:'일반 뽑기'}`);const handler=EFFECTS[this.effect];if(handler)yield* handler(this,p);else yield* this.normal(p);
  for(const owner of this.players.filter(x=>x!==p)){const pairs=this.matchingCards(owner);if(pairs.length){yield* this.ask(owner,'discard',`빛나는 짝 ${pairs.length/2}쌍을 확인하고 버려주세요`,[{key:'discard',label:'짝 확인하고 버리기 ✓'}]);this.removeConfirmedPairs(owner);}}
  const count=this.matchingCards(p).length/2;
  yield* this.ask(p,'finish',count?`짝 ${count}쌍 완성! 내 손패를 확인하고 턴을 넘겨주세요.`:'뽑기가 끝났어요. 내 손패를 확인하고 턴을 넘겨주세요.',[{key:'finish',label:count?'짝 버리고 턴 넘기기 →':'턴 넘기기 →'}]);
  this.clean();this.validate();if(this.terminal())return;const next=this.next(p);this.turn=this.players.indexOf(next);}
 startTurn(){if(this.ended||this.terminal())return;this.publicHands.delete(this.current().id);this.iterator=this.run();this.advance();}
 advance(value?:string){if(!this.iterator)return;const priorMotion=this.motionSeq;const before=new Map(this.players.flatMap(p=>p.hand.map(c=>[c.id,{owner:p.id,card:c}] as const)));const step=this.iterator.next(value!);const after=new Map(this.players.flatMap(p=>p.hand.map(c=>[c.id,p.id] as const)));for(const [id,old] of before){const dest=after.get(id)??'discard';if(dest!==old.owner&&!this.movements.some(e=>e.seq>priorMotion&&e.card.id===id))this.movements.push({seq:++this.motionSeq,from:old.owner,to:dest,revision:this.revision,position:'',card:old.card});}this.movements=this.movements.slice(-160);this.validate();if(step.done){this.prompt=null;this.iterator=null;this.deadline=Date.now()+RULES.turnPauseMs;}else{this.prompt=step.value;this.deadline=Date.now()+(this.prompt.kind==='reveal'?RULES.revealMs:RULES.turnMs);}}
 act(actor:string,key:string,revision:number){if(!this.prompt||this.prompt.actor!==actor||this.prompt.revision!==revision||this.prompt.kind==='reveal'||!this.prompt.choices.some(c=>c.key===key))throw Error('현재 선택할 수 없는 행동이에요.');this.advance(key);}
 tick(now=Date.now()){if(this.ended)return;if(now<this.deadline)return;if(this.prompt){if(this.prompt.kind==='reveal'){this.revealing=false;this.advance('ok');}else this.advance(this.prompt.choices[0].key);}else this.startTurn();}
}
type Effect=(g:Game,p:Player)=>Generator<Prompt,void,string>;
function conditional(test:(c:Card,g:Game,p:Player,matched:boolean)=>boolean):Effect{return function*(g,p){const target=g.next(p);const c=yield* g.pick(p,target);if(c&&test(c,g,p,g.matches(p,c)))yield* g.pick(p,target);};}
export const EFFECTS:Record<number,Effect>={
 0:function*(g,p){const target=g.next(p),n=Math.ceil(target.hand.length/2);const row=target.hand.length===1?'0':yield* g.ask(p,'row','확인할 줄을 골라주세요',[{key:'0',label:'위쪽 줄'},{key:'1',label:'아래쪽 줄'}],target.id);yield* g.pick(p,target,target.hand.slice(Number(row)*n,Number(row)*n+n),true);},
 1:function*(g,p){const c=yield* g.normal(p);if(c&&!g.matches(p,c))g.exchange(p,c,x=>g.matches(p,x));},
 2:conditional(()=>true),
 3:conditional(c=>c.rank%2===0),
 4:conditional(c=>c.rank===0||c.rank%2===1),
 5:function*(g,p){yield* g.pick(p,g.next(p),undefined,false,true);},
 6:function*(g,p){const a=g.next(p,1),b=g.next(p,-1);yield* g.pick(p,a);yield* g.pick(p,b);},
 7:function*(g,p){const c=yield* g.normal(p);if(c&&!g.matches(p,c))g.exchange(p,c,x=>x.rank===0);},
 8:function*(g,p){const answer=yield* g.ask(p,'predict','뽑을 카드와 같은 숫자가 내 손패에 있을까요?',[{key:'yes',label:'있다 · 짝이 된다'},{key:'no',label:'없다 · 짝이 안 된다'}]);const target=g.next(p),c=yield* g.pick(p,target);if(c&&g.matches(p,c)===(answer==='yes'))yield* g.pick(p,target);},
 9:conditional(c=>!['♠','♣'].includes(c.suit)),
 10:conditional(c=>!['♥','♦'].includes(c.suit)),
 11:function*(g,p){const target=g.next(p),c=yield* g.pick(p,target);if(!c||!target.hand.length)return;const answer=yield* g.ask(p,'retry','뽑은 카드를 유지할까요?',[{key:'keep',label:'이 카드 유지',card:c},{key:'retry',label:'돌려주고 다시 뽑기'}]);if(answer==='retry'){g.transfer(p,target,c.id);yield* g.pick(p,target,target.hand.filter(x=>x.id!==c.id));}},
 12:function*(g,p){const target=g.next(p);yield* g.pick(p,target);const count=Math.min(2,p.hand.length);for(let i=0;i<count;i++){const id=yield* g.ask(p,'give',`건넬 카드 ${i+1}/${count}`,p.hand.map(c=>({key:c.id,label:'건네기',card:c})));g.transfer(p,target,id);}},
 13:function*(g,p){const c=yield* g.normal(p);if(c&&g.matches(p,c)&&!g.exchange(p,c,x=>!g.matches(p,x)))p.blocked=true;},
 14:function*(g,p){g.publicHands.add(p.id);g.log(`${p.name} 님의 손패가 다음 본인 차례까지 공개됩니다`);yield* g.normal(p);},
 15:function*(g,p){const target=g.next(p),c=yield* g.pick(p,target);if(c&&g.matches(p,c)){g.transfer(p,target,c.id);yield* g.pick(p,target,RULES.reselectSame?undefined:target.hand.filter(x=>x.id!==c.id));}},
 16:function*(g,p){const id=yield* g.ask(p,'player','비교할 상대를 골라주세요',g.alive().filter(x=>x!==p).map(x=>({key:x.id,label:x.name})));const target=g.players.find(x=>x.id===id)!;const high=(x:Player)=>x.hand.reduce((a,b)=>comparisonValue(a)>comparisonValue(b)?a:b);const a=high(p),b=high(target),av=comparisonValue(a),bv=comparisonValue(b);g.log(`${p.name}: ${a.suit}${av} / ${target.name}: ${b.suit}${bv}`);if(av===bv)return;const from=av>bv?p:target,to=from===p?target:p;const keep=yield* g.ask(from,'keep','내게 남길 카드 한 장을 골라주세요',from.hand.map(c=>({key:c.id,label:'남기기',card:c})));for(const c of [...from.hand])if(c.id!==keep)g.transfer(from,to,c.id);},
 17:function*(g,p){const c=yield* g.normal(p);if(c&&c.rank!==0)g.exchange(p,c,x=>x.rank===0);},
 18:function*(g,p){const others=g.alive().filter(x=>x!==p),min=Math.min(...others.map(x=>x.hand.length));const target=shuffle(others.filter(x=>x.hand.length===min))[0];g.swapHands(p,target);yield* g.normal(p);},
 19:function*(g,p){g.redistribute();yield* g.normal(p);},
 20:function*(g,p){yield* g.normal(p);const targets=shuffle(g.alive().filter(x=>x!==p));for(const target of targets){if(p.hand.length<=1)break;const id=yield* g.ask(p,'give',`${target.name} 님에게 한 장 나누기`,p.hand.map(c=>({key:c.id,label:'나누기',card:c})));g.transfer(p,target,id);}},
 21:function*(g,p){for(const target of g.alive().filter(x=>x!==p))yield* g.pick(p,target);},
 22:conditional(c=>![1,11,12,13].includes(c.rank)),
 23:function*(g,p){if(p.hand.length===1&&p.hand[0].rank===0){const target=g.next(p);if(target!==p)g.transfer(p,target,p.hand[0].id);return;}const eligible=p.hand.filter(c=>c.rank!==0&&(p.hand.some(x=>pairable(c,x))||g.alive().some(x=>x!==p&&x.hand.some(h=>pairable(c,h)))));if(!eligible.length){yield* g.normal(p);return;}const id=yield* g.ask(p,'keep','짝으로 버릴 내 카드 한 장을 선택하세요',eligible.map(c=>({key:c.id,label:'짝으로 내기',card:c})));const card=p.hand.find(c=>c.id===id)!;let mate=p.hand.find(c=>pairable(card,c));if(!mate){const owner=g.alive().find(x=>x!==p&&x.hand.some(c=>pairable(card,c)));if(owner){mate=owner.hand.find(c=>pairable(card,c))!;g.transfer(owner,p,mate.id);}}if(mate){const ids=new Set([card.id,mate.id]);g.discard.push(...p.hand.filter(c=>ids.has(c.id)));p.hand=p.hand.filter(c=>!ids.has(c.id));}}

};
