import {randomInt} from 'node:crypto';
import {Card,Prompt} from '../shared/types.js';
import {pairable} from './game.js';

// Only the bot's hand and its permitted prompt are used. Hidden choice keys
// are opaque: the bot never reads another player's hand or the TROW deck.
export function chooseBotAction(prompt:Prompt,hand:Card[]):string {
 const random=<T>(items:T[])=>items[randomInt(items.length)];
 const matching=(card:Card)=>hand.some(c=>pairable(c,card));
 if(prompt.kind==='draw') {
  const revealed=prompt.choices.filter(c=>c.card&&matching(c.card));
  if(revealed.length)return random(revealed).key;
  const safe=prompt.choices.filter(c=>c.card&&c.card.rank!==0);
  if(safe.length)return random(safe).key;
  const glowing=prompt.choices.filter(c=>c.glow);
  return random(glowing.length?glowing:prompt.choices).key;
 }
 if(prompt.kind==='retry') {
  const drawn=prompt.choices.find(c=>c.card)?.card;
  return drawn&&matching(drawn)?'keep':'retry';
 }
 if(prompt.kind==='give') {
  const jokers=prompt.choices.filter(c=>c.card?.rank===0);
  const unmatched=prompt.choices.filter(c=>c.card&&!matching(c.card));
  return random(jokers.length?jokers:unmatched.length?unmatched:prompt.choices).key;
 }
 if(prompt.kind==='keep') {
  const safe=prompt.choices.filter(c=>c.card&&c.card.rank!==0);
  return random(safe.length?safe:prompt.choices).key;
 }
 return random(prompt.choices).key;
}
