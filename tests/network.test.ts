import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io,Socket} from 'socket.io-client';
import {View} from '../shared/types.js';
test('real sockets: invitations, privacy, reconnect, host transfer, matchmaking', {timeout:60000},async()=>{
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'3099'},stdio:['ignore','pipe','pipe']});
 const clients:Socket[]=[];
 function connect(){const s=io('http://127.0.0.1:3099',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(s);return s;}
 function event<T>(s:Socket,name:string,predicate:(v:T)=>boolean=()=>true):Promise<T>{return new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.off(name,fn);reject(Error('timeout '+name));},12000);const fn=(v:T)=>{if(predicate(v)){clearTimeout(t);s.off(name,fn);resolve(v);}};s.on(name,fn);});}
 try{
 await once(child.stdout!,'data');
 const a=connect(),b=connect();await Promise.all([event(a,'connect'),event(b,'connect')]);
 const session=event<{code:string;token:string}>(a,'session'),av=event<View>(a,'state');a.emit('enter',{mode:'create',name:'Alice'});const saved=await session;const initial=await av;
 const bv=event<View>(b,'state');b.emit('enter',{mode:'join',name:'Bob',code:saved.code});const joined=await bv;assert.equal(joined.players.length,2);
 const notHost=event<string>(b,'error:message');b.emit('start',{});assert.match(await notHost,/방장/);
 const startedA=event<View>(a,'state',v=>v.status==='playing'||v.status==='ended'),startedB=event<View>(b,'state',v=>v.status==='playing'||v.status==='ended');a.emit('start',{});const [va,vb]=await Promise.all([startedA,startedB]);assert.equal(va.game?.turn,vb.game?.turn);if(!va.game?.revealing){assert.ok(va.players.every(p=>p.hand===undefined));}if(va.game?.prompt)assert.ok(va.game.prompt.choices.every(c=>/^\d+$/.test(c.key)));
 const hostTransfer=event<View>(b,'state',v=>v.host===joined.me);a.disconnect();await hostTransfer;
 const resumed=connect();await event(resumed,'connect');const resumedView=event<View>(resumed,'state');resumed.emit('resume',saved);assert.equal((await resumedView).me,initial.me);
 const solo=connect();await event(solo,'connect');const lobby=event<View>(solo,'state');solo.emit('enter',{mode:'create',name:'Solo tester'});await lobby;
 const withBot=event<View>(solo,'state',v=>v.players.length===2);solo.emit('bot:add',{});const botRoom=await withBot;const bot=botRoom.players.find(p=>p.bot)!;assert.ok(bot.online);
 const removed=event<View>(solo,'state',v=>v.players.length===1);solo.emit('bot:remove',{id:bot.id});await removed;
 const readded=event<View>(solo,'state',v=>v.players.length===2);solo.emit('bot:add',{});await readded;
 const soloStart=event<View>(solo,'state',v=>v.status!=='waiting');solo.emit('start',{});let soloState=await soloStart;
 for(let i=0;i<8&&soloState.status==='playing';i++){const previous=soloState.game!.revision;const updated=event<View>(solo,'state',v=>v.status==='ended'||v.game!.revision!==previous);const p=soloState.game?.prompt;if(p&&p.kind!=='reveal')solo.emit('action',{key:p.choices[0].key,revision:p.revision});soloState=await updated;for(const draw of soloState.game!.draws){if(draw.to!==soloState.me)assert.equal(draw.card,undefined,'animation must hide opponent card');else assert.ok(draw.card,'recipient sees their actual drawn card');}}
 const c=connect(),d=connect();await Promise.all([event(c,'connect'),event(d,'connect')]);const cs=event<View>(c,'state');c.emit('enter',{mode:'match',name:'Match A'});const cv=await cs;const ds=event<View>(d,'state');d.emit('enter',{mode:'match',name:'Match B'});assert.equal((await ds).code,cv.code);const matched=await event<View>(c,'state',v=>v.status==='playing'||v.status==='ended');assert.ok(matched.game);assert.equal(matched.players.length,2);assert.ok(matched.players.every(p=>!p.bot));
 }finally{clients.forEach(s=>s.disconnect());child.kill();}
});

