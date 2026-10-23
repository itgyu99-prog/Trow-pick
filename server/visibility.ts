import type {Game} from './game.js';
import type {DrawScene} from '../shared/types.js';

// Opening Night exposes only its user's hand to the room, for the reveal phase.
export function publiclyVisibleHand(game:Game|undefined,playerId:string){
 if(!game||(!game.revealing&&!game.ended))return undefined;
 return game.players.find(p=>p.id===playerId)?.hand;
}

// Observers receive positions only. Even effect-specific faces and glow hints
// are stripped here, rather than merely covered by the browser.
export function visibleDrawScene(game:Game,viewer:string):DrawScene|null{
 const held=game.drawScene&&game.drawScene.expires>Date.now()?game.drawScene:undefined;
 const prompt=held?.prompt??(game.prompt?.kind==='draw'?game.prompt:undefined);
 if(!prompt)return null;
 return {actor:prompt.actor,target:prompt.target,kind:'draw',message:prompt.message,revision:prompt.revision,selected:held?.selected,
  choices:prompt.choices.map((c,i)=>viewer===prompt.actor?{...c,key:String(i)}:{key:String(i),label:'뒤집힌 카드'})};
}

