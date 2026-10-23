import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Card,DrawEvent,View} from '../shared/types';
import './draw-motion.css';

type Origin={x:number;y:number};
type Flight=DrawEvent&{start:Origin;end:Origin;label:string;width:number;height:number};
type RedealCard={key:string;from:Origin;pile:Origin;mix:Origin;to:Origin;rotation:number;size:number};
export const DRAW_MOTION_MS=650;
const REDEAL_MOTION_MS=2800;

// States stay live; only visual events queue. A reconnect never replays history.
export function DrawMotion({view,reduced,origin,onBusy,onPending}:{view:View|null;reduced:boolean;origin:React.RefObject<Origin|null>;onBusy:(busy:boolean)=>void;onPending:(cards:Card[])=>void}){
 const motionReduced=reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const seen=useRef({game:'',seq:0,redealSeq:0});
 const previousCounts=useRef<Record<string,number>|null>(null);
 const [queue,setQueue]=useState<DrawEvent[]>([]);
 const [flights,setFlights]=useState<Flight[]>([]);
 const [redeal,setRedeal]=useState<RedealCard[]>([]);
 const latest=useRef(view);latest.current=view;
 useLayoutEffect(()=>{
  const game=view?.game;
  if(!game){seen.current={game:'',seq:0,redealSeq:0};previousCounts.current=null;setQueue([]);setFlights([]);setRedeal([]);return;}
  const currentCounts=Object.fromEntries(view.players.map(p=>[p.id,p.count]));
  if(seen.current.game!==game.id){seen.current={game:game.id,seq:game.movements.at(-1)?.seq??0,redealSeq:game.redealSeq};previousCounts.current=currentCounts;setQueue([]);setFlights([]);setRedeal([]);return;}
  if(game.redealSeq>seen.current.redealSeq){
   seen.current.redealSeq=game.redealSeq;
   seen.current.seq=game.movements.at(-1)?.seq??seen.current.seq;
   setQueue([]);setFlights([]);
   if(!motionReduced){
    const before=previousCounts.current??currentCounts;
    const center=(element:Element|null):Origin=>{const r=element?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
    const field=document.querySelector('.make-field');
    const pile=center(field);
    const sources=view.players.flatMap(p=>Array.from({length:before[p.id]??0},(_,i)=>({point:center(document.querySelector(`[data-seat="${p.id}"]`)),index:i,count:before[p.id]??0,id:p.id})));
    const destinations=view.players.flatMap(p=>Array.from({length:p.count},(_,i)=>({point:center(document.querySelector(`[data-seat="${p.id}"]`)),index:i,count:p.count,id:p.id})));
    const shuffled=[...destinations];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    const cards=sources.slice(0,shuffled.length).map((source,i)=>{
     const target=shuffled[i],fan=(n:number,count:number)=>({x:(n-(count-1)/2)*3.2,y:Math.abs(n-(count-1)/2)*1.4});
     const startOffset=fan(source.index,source.count),endOffset=fan(target.index,target.count);
     const size=innerWidth<600?29:36;
     const pileX=((i%9)-4)*5.2,pileY=(Math.floor(i/9)-2)*6.4;
     return {key:`${game.redealSeq}-${i}`,from:{x:source.point.x+startOffset.x,y:source.point.y+startOffset.y},pile:{x:pile.x+pileX,y:pile.y+pileY},mix:{x:pile.x+pileX+(Math.random()-.5)*62,y:pile.y+pileY+(Math.random()-.5)*50},to:{x:target.point.x+endOffset.x,y:target.point.y+endOffset.y},rotation:Math.random()*70-35,size};
    });
    setRedeal(cards);
   }
  }else{
   const fresh=game.movements.filter(e=>e.seq>seen.current.seq);
   if(fresh.length){seen.current.seq=fresh.at(-1)!.seq;if(!motionReduced)setQueue(q=>[...q,...fresh.filter(e=>e.to!=='discard'&&(e.to!==view?.me||game.hand.some(c=>c.id===e.card?.id)))]);}
  }
  previousCounts.current=currentCounts;
 },[view,motionReduced]);
 useLayoutEffect(()=>{onPending([...flights,...queue].filter(e=>e.to===view?.me&&e.card).map(e=>e.card!));},[queue,flights,view?.me,onPending]);
 useEffect(()=>{if(motionReduced){setQueue([]);setFlights([]);setRedeal([]);}},[motionReduced]);
 useEffect(()=>{onBusy(redeal.length>0||flights.length>0||queue.length>0);},[redeal.length,flights,queue.length,onBusy]);
 useEffect(()=>{if(!redeal.length)return;const timer=setTimeout(()=>setRedeal([]),REDEAL_MOTION_MS);return()=>clearTimeout(timer);},[redeal]);
 useEffect(()=>{
  if(redeal.length||flights.length||!queue.length)return;
  const frame=requestAnimationFrame(()=>{
  const v=latest.current;
  if(!v)return;
  const center=(element:Element|null):Origin=>{const r=element?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
  const seat=(id:string)=>id==='discard'?document.querySelector('[data-discard]'):document.querySelector(`[data-seat="${id}"]`);
  const batch=queue.filter(e=>e.revision===queue[0].revision);
  const nextFlights=batch.map((event,index)=>{
  const shownCard=document.querySelector(`[data-draw-revision="${event.revision}"][data-draw-position="${event.position}"]`);
  const start=index===0&&event.to===v.me&&origin.current?origin.current:center(shownCard??(event.from===v.me?document.querySelector('[data-hand]'):seat(event.from)));
  const destination=event.to===v.me?document.querySelector(`[data-hand-card="${event.card?.id}"]`):seat(event.to);
  const end=center(destination);
  const cardRect=event.to===v.me?destination?.getBoundingClientRect():document.querySelector('.playing-card,.card')?.getBoundingClientRect();
  const width=cardRect?.width||84,height=cardRect?.height||120;
  return {...event,start,end,width,height,label:event.to==='discard'?'짝이 버림 더미로 이동해요':`${v.players.find(p=>p.id===event.from)?.name??''} → ${v.players.find(p=>p.id===event.to)?.name??''}`};
  });
  origin.current=null;setFlights(nextFlights);
  const ids=new Set(batch.map(e=>e.seq));setQueue(q=>q.filter(e=>!ids.has(e.seq)));
  });
  return()=>cancelAnimationFrame(frame);
 },[queue,flights,redeal,origin]);
 useEffect(()=>{if(!flights.length)return;const timer=setTimeout(()=>setFlights([]),DRAW_MOTION_MS);return()=>clearTimeout(timer);},[flights]);
 if(redeal.length)return <div className="redeal-overlay" aria-live="polite"><div className="redeal-veil"/><div className="redeal-caption">패를 한곳에 모아 섞고 있어요</div>{redeal.map(card=>{const style={'--start-x':`${card.from.x}px`,'--start-y':`${card.from.y}px`,'--pile-x':`${card.pile.x}px`,'--pile-y':`${card.pile.y}px`,'--mix-x':`${card.mix.x}px`,'--mix-y':`${card.mix.y}px`,'--end-x':`${card.to.x}px`,'--end-y':`${card.to.y}px`,'--half-width':`${card.size/2}px`,'--half-height':`${card.size*1.4/2}px`,'--card-width':`${card.size}px`,'--card-height':`${card.size*1.4}px`,'--mix-turn':`${card.rotation}deg`} as React.CSSProperties;return <div key={card.key} className="redeal-card" style={style}><span>✳</span></div>})}</div>;
 if(!flights.length)return null;
 const renderFlight=(flight:Flight)=>{const card=flight.to==='discard'?undefined:flight.card,rank=card?['JK','A','2','3','4','5','6','7','8','9','10','J','Q','K'][card.rank]:'';
 const style={'--from-x':`${flight.start.x}px`,'--from-y':`${flight.start.y}px`,'--to-x':`${flight.end.x}px`,'--to-y':`${flight.end.y}px`,'--card-width':`${flight.width}px`,'--card-height':`${flight.height}px`,'--half-width':`${flight.width/2}px`,'--half-height':`${flight.height/2}px`} as React.CSSProperties;
 return <div key={flight.seq} className="flying-card" style={style}><div className={`flying-flip ${card?'show-face':''}`}><div className="flight-back">✳</div><div className={`flight-front ${card&&['♥','♦'].includes(card.suit)?'red':''}`}><span>{rank}</span><strong>{card?.suit}</strong></div></div></div>;
 };
 return <div className="draw-overlay" aria-live="polite">{flights.map(renderFlight)}<div className="draw-caption">{flights.length>1?`카드 ${flights.length}장이 함께 이동해요`:flights[0].label}</div></div>;
}
