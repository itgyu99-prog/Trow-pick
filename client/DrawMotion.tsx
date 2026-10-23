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
 const [flight,setFlight]=useState<Flight|null>(null);
 const latest=useRef(view);latest.current=view;
 useLayoutEffect(()=>{
  const game=view?.game;
  if(!game){seen.current={game:'',seq:0};setQueue([]);setFlight(null);return;}
  if(seen.current.game!==game.id){seen.current={game:game.id,seq:game.movements.at(-1)?.seq??0};setQueue([]);setFlight(null);return;}
  const fresh=game.movements.filter(e=>e.seq>seen.current.seq);
  if(fresh.length){seen.current.seq=fresh.at(-1)!.seq;if(!motionReduced)setQueue(q=>[...q,...fresh.filter(e=>e.to!=='discard')]);}
 },[view,motionReduced]);
 useLayoutEffect(()=>{onPending([...(flight?[flight]:[]),...queue].filter(e=>e.to===view?.me&&e.card).map(e=>e.card!));},[queue,flight,view?.me,onPending]);
 useEffect(()=>{if(motionReduced){setQueue([]);setFlight(null);}},[motionReduced]);
 useEffect(()=>{onBusy(!!flight||queue.length>0);},[flight,queue.length,onBusy]);
 useEffect(()=>{
  if(flight||!queue.length)return;
  const frame=requestAnimationFrame(()=>{
  const event=queue[0],v=latest.current;
  if(!v)return;
  const center=(element:Element|null):Origin=>{const r=element?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:{x:innerWidth/2,y:innerHeight/2};};
  const seat=(id:string)=>id==='discard'?document.querySelector('[data-discard]'):document.querySelector(`[data-seat="${id}"]`);
  const shownCard=document.querySelector(`[data-draw-revision="${event.revision}"][data-draw-position="${event.position}"]`);
  const start=event.to===v.me&&origin.current?origin.current:center(shownCard??(event.from===v.me?document.querySelector('[data-hand]'):seat(event.from)));
  const destination=event.to===v.me?document.querySelector(`[data-hand-card="${event.card?.id}"]`):seat(event.to);
  if(event.to===v.me&&destination)destination.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const end=center(destination);
  const cardRect=event.to===v.me?destination?.getBoundingClientRect():document.querySelector('.card')?.getBoundingClientRect();
  const width=cardRect?.width||84,height=cardRect?.height||120;
  origin.current=null;
  setFlight({...event,start,end,width,height,label:event.to==='discard'?'짝이 버림 더미로 이동해요':`${v.players.find(p=>p.id===event.from)?.name??''} → ${v.players.find(p=>p.id===event.to)?.name??''}`});
  setQueue(q=>q.slice(1));
  });
  return()=>cancelAnimationFrame(frame);
 },[queue,flight,origin]);
 useEffect(()=>{if(!flight)return;const timer=setTimeout(()=>setFlight(null),DRAW_MOTION_MS);return()=>clearTimeout(timer);},[flight]);
 if(!flight)return null;
 const card=flight.to==='discard'?undefined:flight.card,rank=card?['JK','A','2','3','4','5','6','7','8','9','10','J','Q','K'][card.rank]:'';
 const style={'--from-x':`${flight.start.x}px`,'--from-y':`${flight.start.y}px`,'--to-x':`${flight.end.x}px`,'--to-y':`${flight.end.y}px`,'--card-width':`${flight.width}px`,'--card-height':`${flight.height}px`,'--half-width':`${flight.width/2}px`,'--half-height':`${flight.height/2}px`} as React.CSSProperties;
 return <div className="draw-overlay" aria-live="polite"><div key={flight.seq} className="flying-card" style={style}><div className={`flying-flip ${card?'show-face':''}`}><div className="flight-back">✳<small>TROW PICK</small></div><div className={`flight-front ${card&&['♥','♦'].includes(card.suit)?'red':''}`}><span>{rank}</span><strong>{card?.suit}</strong></div></div></div><div className="draw-caption">{flight.label}</div></div>;
}
