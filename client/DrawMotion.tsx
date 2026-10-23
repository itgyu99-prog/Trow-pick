import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Card,DrawEvent,View} from '../shared/types';
import './draw-motion.css';

type Origin={x:number;y:number};
type Flight=DrawEvent&{start:Origin;end:Origin;label:string;width:number;height:number};
export const DRAW_MOTION_MS=650;

// States stay live; only visual events queue. A reconnect never replays history.
export function DrawMotion({view,reduced,origin,onBusy,onPending}:{view:View|null;reduced:boolean;origin:React.RefObject<Origin|null>;onBusy:(busy:boolean)=>void;onPending:(cards:Card[])=>void}){
 const motionReduced=reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const seen=useRef({game:'',seq:0});
 const [queue,setQueue]=useState<DrawEvent[]>([]);
 const [flights,setFlights]=useState<Flight[]>([]);
 const latest=useRef(view);latest.current=view;
 useLayoutEffect(()=>{
  const game=view?.game;
  if(!game){seen.current={game:'',seq:0};setQueue([]);setFlights([]);return;}
  if(seen.current.game!==game.id){seen.current={game:game.id,seq:game.movements.at(-1)?.seq??0};setQueue([]);setFlights([]);return;}
  const fresh=game.movements.filter(e=>e.seq>seen.current.seq);
  if(fresh.length){seen.current.seq=fresh.at(-1)!.seq;if(!motionReduced)setQueue(q=>[...q,...fresh.filter(e=>e.to!=='discard'&&(e.to!==view?.me||game.hand.some(c=>c.id===e.card?.id)))]);}
 },[view,motionReduced]);
 useLayoutEffect(()=>{onPending([...flights,...queue].filter(e=>e.to===view?.me&&e.card).map(e=>e.card!));},[queue,flights,view?.me,onPending]);
 useEffect(()=>{if(motionReduced){setQueue([]);setFlights([]);}},[motionReduced]);
 useEffect(()=>{onBusy(flights.length>0||queue.length>0);},[flights,queue.length,onBusy]);
 useEffect(()=>{
  if(flights.length||!queue.length)return;
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
  // Keep the page stable; the hand scroll container handles card overflow.
  const end=center(destination);
  const cardRect=event.to===v.me?destination?.getBoundingClientRect():document.querySelector('.playing-card,.card')?.getBoundingClientRect();
  const width=cardRect?.width||84,height=cardRect?.height||120;
  return {...event,start,end,width,height,label:event.to==='discard'?'짝이 버림 더미로 이동해요':`${v.players.find(p=>p.id===event.from)?.name??''} → ${v.players.find(p=>p.id===event.to)?.name??''}`};
  });
  origin.current=null;setFlights(nextFlights);
  const ids=new Set(batch.map(e=>e.seq));setQueue(q=>q.filter(e=>!ids.has(e.seq)));
  });
  return()=>cancelAnimationFrame(frame);
 },[queue,flights,origin]);
 useEffect(()=>{if(!flights.length)return;const timer=setTimeout(()=>setFlights([]),DRAW_MOTION_MS);return()=>clearTimeout(timer);},[flights]);
 if(!flights.length)return null;
 const renderFlight=(flight:Flight)=>{const card=flight.to==='discard'?undefined:flight.card,rank=card?['JK','A','2','3','4','5','6','7','8','9','10','J','Q','K'][card.rank]:'';
 const style={'--from-x':`${flight.start.x}px`,'--from-y':`${flight.start.y}px`,'--to-x':`${flight.end.x}px`,'--to-y':`${flight.end.y}px`,'--card-width':`${flight.width}px`,'--card-height':`${flight.height}px`,'--half-width':`${flight.width/2}px`,'--half-height':`${flight.height/2}px`} as React.CSSProperties;
 return <div key={flight.seq} className="flying-card" style={style}><div className={`flying-flip ${card?'show-face':''}`}><div className="flight-back">✳<small>TROW PICK</small></div><div className={`flight-front ${card&&['♥','♦'].includes(card.suit)?'red':''}`}><span>{rank}</span><strong>{card?.suit}</strong></div></div></div>;
 };
 return <div className="draw-overlay" aria-live="polite">{flights.map(renderFlight)}<div className="draw-caption">{flights.length>1?`카드 ${flights.length}장이 함께 이동해요`:flights[0].label}</div></div>;
}
