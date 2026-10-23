import express from 'express';
import {createServer} from 'node:http';
import {randomBytes,randomInt} from 'node:crypto';
import {Server,Socket} from 'socket.io';
import {resolve} from 'node:path';
import {Game} from './game.js';
import {RULES,View} from '../shared/types.js';
import {chooseBotAction} from './bot.js';
import {publiclyVisibleHand,visibleDrawScene} from './visibility.js';
type Member={id:string;name:string;token:string;socket?:string;bot?:boolean};
type Room={code:string;mode:string;host:string;members:Member[];game?:Game;matchAt?:number;emptyAt?:number;botAt?:number;botRevision?:number};
export const app=express(),http=createServer(app),io=new Server(http,{maxHttpBufferSize:8192});
const rooms=new Map<string,Room>();
const identity=new Map<string,{room:Room;member:Member}>();
const token=()=>randomBytes(24).toString('hex');
function view(r:Room,m:Member):View{const g=r.game,p=g?.players.find(p=>p.id===m.id);const prompt=g?.prompt?.actor===m.id?{...g.prompt,choices:g.prompt.choices.map((c,i)=>({...c,key:String(i),...(g.prompt?.kind==='player'?{playerId:c.key}:{})}))}:null;return {code:r.code,mode:r.mode,host:r.host,me:m.id,status:g?(g.ended?'ended':'playing'):'waiting',players:r.members.map(m=>{const p=g?.players.find(p=>p.id===m.id);return {id:m.id,name:m.name,count:p?.hand.length??0,online:!!m.socket||!!m.bot,bot:!!m.bot,rank:p?.rank,hand:publiclyVisibleHand(g,m.id)};}),game:g?{id:g.id,activity:g.prompt?{actor:g.prompt.actor,message:g.prompt.message,target:g.prompt.target,kind:g.prompt.kind,count:g.players.find(p=>p.id===g.prompt?.target)?.hand.length??0}:undefined,drawScene:visibleDrawScene(g,m.id),stage:g.prompt?.kind??'waiting',matching:p?g.matchingCards(p).map(c=>c.id):[],movements:g.movements.map(e=>({...e,card:e.to===m.id||e.from===m.id?e.card:undefined})),draws:g.draws.map(e=>({seq:e.seq,from:e.from,to:e.to,revision:e.revision,position:e.position,card:e.to===m.id?e.card:undefined})),turn:g.current().id,direction:g.direction,effect:g.effect,remaining:g.trows.length,used:g.used.length,discarded:g.discard.length,prompt,revealing:g.revealing,deadline:g.deadline,logs:g.logs,revision:g.revision,hand:p?.hand??[]}:undefined};}
function broadcast(r:Room){for(const m of r.members)if(m.socket)io.to(m.socket).emit('state',view(r,m));}
function start(r:Room){if(r.members.length<2)throw Error('두 명 이상 모이면 시작할 수 있어요.');if(r.members.some(m=>!m.socket&&!m.bot))throw Error('접속하지 않은 참가자가 있어요.');r.game=new Game(r.members);r.botAt=undefined;r.botRevision=undefined;r.game.startTurn();r.matchAt=undefined;broadcast(r);}
function leave(s:Socket){const data=identity.get(s.id);if(!data)return;const {room:r,member:m}=data;identity.delete(s.id);m.socket=undefined;if(!r.game||r.game.ended){r.members=r.members.filter(x=>x!==m);if(r.members.length)r.host=r.members.find(m=>m.socket)?.id??r.members[0].id;}else if(r.host===m.id)r.host=r.members.find(m=>m.socket)?.id??m.id;if(!r.members.some(m=>m.socket))r.emptyAt=Date.now();broadcast(r);s.emit('left');}
io.on('connection',s=>{
 let calls:number[]=[];
 const handle=(event:string,fn:(d:any)=>void)=>s.on(event,(d:unknown)=>{try{const now=Date.now();calls=calls.filter(t=>now-t<10000);if(calls.length>50)throw Error('잠시 후 다시 시도해 주세요.');calls.push(now);if(!d||typeof d!=='object')throw Error('잘못된 요청입니다.');fn(d);}catch(e){s.emit('error:message',e instanceof Error?e.message:'요청을 처리하지 못했어요.');}});
 handle('enter',d=>{if(identity.has(s.id))throw Error('현재 방에서 먼저 나가주세요.');const name=typeof d.name==='string'?d.name.trim().slice(0,14):'';if(!name)throw Error('닉네임을 입력해주세요.');let r:Room|undefined;
 if(d.mode==='join'){if(typeof d.code!=='string')throw Error('방 코드를 입력해주세요.');r=rooms.get(d.code.toUpperCase());if(!r)throw Error('방을 찾을 수 없어요.');if(r.game)throw Error('이미 시작된 방이에요.');}
 else if(d.mode==='match')r=[...rooms.values()].find(r=>r.mode==='match'&&!r.game&&r.members.length<15);
 else if(d.mode!=='create')throw Error('잘못된 참가 방식입니다.');
 if(!r){let code='';do{code=Array.from({length:5},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(31)]).join('');}while(rooms.has(code));r={code,mode:d.mode==='match'?'match':'private',host:'',members:[]};rooms.set(code,r);}
 if(r.members.length>=15)throw Error('방이 가득 찼어요.');const m:Member={id:randomBytes(8).toString('hex'),name,token:token(),socket:s.id};r.members.push(m);r.emptyAt=undefined;if(!r.host)r.host=m.id;identity.set(s.id,{room:r,member:m});s.emit('session',{code:r.code,token:m.token});if(r.mode==='match'&&r.members.length>=2&&!r.matchAt)r.matchAt=Date.now()+RULES.matchMs;broadcast(r);
 });
 handle('resume',d=>{const r=rooms.get(d.code);const m=r?.members.find(m=>m.token===d.token);if(!r||!m)throw Error('저장된 방이 만료되었어요.');if(identity.has(s.id))return;if(m.socket){identity.delete(m.socket);io.sockets.sockets.get(m.socket)?.disconnect(true);}m.socket=s.id;r.emptyAt=undefined;identity.set(s.id,{room:r,member:m});broadcast(r);});
 handle('start',()=>{const data=identity.get(s.id);if(!data||data.room.host!==data.member.id)throw Error('방장만 시작할 수 있어요.');if(data.room.game&&!data.room.game.ended)throw Error('게임이 진행 중이에요.');start(data.room);});
 handle('bot:add',()=>{const data=identity.get(s.id);if(!data||data.room.host!==data.member.id)throw Error('방장만 AI를 추가할 수 있어요.');const r=data.room;if(r.mode!=='private'||r.game)throw Error('AI는 친구 방 대기실에서 추가해주세요.');if(r.members.length>=RULES.maxPlayers)throw Error('방이 가득 찼어요.');const used=new Set(r.members.map(m=>m.name));let n=1;while(used.has(`AI 픽봇 ${n}`))n++;r.members.push({id:randomBytes(8).toString('hex'),name:`AI 픽봇 ${n}`,token:token(),bot:true});broadcast(r);});
 handle('bot:remove',d=>{const data=identity.get(s.id);if(!data||data.room.host!==data.member.id)throw Error('방장만 AI를 제거할 수 있어요.');const r=data.room;if(r.game||r.mode!=='private')throw Error('대기실에서만 AI를 제거할 수 있어요.');const bot=r.members.find(m=>m.id===d.id&&m.bot);if(!bot)throw Error('AI 참가자를 선택해주세요.');r.members=r.members.filter(m=>m!==bot);broadcast(r);});
 handle('action',d=>{const data=identity.get(s.id),g=data?.room.game;if(!data||!g||!g.prompt)throw Error('진행 중인 선택이 없어요.');if(typeof d.key!=='string'||!/^\d+$/.test(d.key))throw Error('잘못된 카드 선택입니다.');const choice=g.prompt.choices[Number(d.key)];if(!choice)throw Error('선택할 수 없는 카드예요.');g.act(data.member.id,choice.key,d.revision);broadcast(data.room);});
 handle('lobby',()=>{const data=identity.get(s.id);if(!data||data.room.host!==data.member.id||!data.room.game?.ended)throw Error('게임 종료 후 방장이 이동할 수 있어요.');data.room.game=undefined;data.room.members=data.room.members.filter(m=>m.socket||m.bot);broadcast(data.room);});
 handle('leave',()=>leave(s));s.on('disconnect',()=>leave(s));
});
const timer=setInterval(()=>{for(const r of rooms.values()){if(r.emptyAt&&Date.now()-r.emptyAt>10*60*1000){rooms.delete(r.code);continue;}if(r.matchAt&&Date.now()>=r.matchAt){r.members=r.members.filter(m=>m.socket);if(r.members.length>=2)start(r);else r.matchAt=undefined;}if(r.game?.drawScene&&Date.now()>=r.game.drawScene.expires){r.game.drawScene=undefined;broadcast(r);}if(r.game&&!r.game.ended){const g=r.game,prompt=g.prompt;const bot=prompt&&r.members.find(m=>m.id===prompt.actor&&m.bot);if(bot&&prompt.kind!=='reveal'){if(r.botRevision!==prompt.revision){r.botRevision=prompt.revision;r.botAt=Date.now()+RULES.botThinkMs;}if(Date.now()>=(r.botAt??Infinity)){const hand=g.players.find(p=>p.id===bot.id)!.hand;g.act(bot.id,chooseBotAction(prompt,hand),prompt.revision);broadcast(r);}}else{r.botRevision=undefined;r.botAt=undefined;}if(!g.ended&&Date.now()>=g.deadline){g.tick();broadcast(r);}}}},150);timer.unref();
app.get('/health',(_,res)=>res.json({ok:true}));app.use(express.static(resolve('dist')));app.get('*',(_,res)=>res.sendFile(resolve('dist/index.html')));
const port=Number(process.env.PORT||3001);http.listen(port,'0.0.0.0',()=>console.log(`TROW PICK server: http://localhost:${port}`));

