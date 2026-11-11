export const areas=['Chest','Back','Shoulders','Arms','Lower Body'];
export const classes=[
  {name:'Total Body',days:'Friday · Sunday',areas,pose:0},
  {name:'Arms & Abs',days:'Monday',areas:['Arms','Shoulders'],pose:2},
  {name:'Full Body · Lower Focus',days:'Tuesday',areas:['Lower Body'],pose:3},
  {name:'Chest, Back & Abs',days:'Wednesday',areas:['Chest','Back'],pose:1},
  {name:'Abs & Ass',days:'Thursday',areas:['Lower Body'],pose:4},
  {name:'Full Body · Upper Focus',days:'Saturday',areas:['Chest','Back','Shoulders','Arms'],pose:5}
];
export function validWeight(v){return (typeof v==='number'||(typeof v==='string'&&v.trim()!=='')) && Number.isFinite(Number(v)) && Number(v)>=0 && Number(v)<=200 && Number.isInteger(Number(v)*2)}
export function cleanData(value){const result={};for(const area of areas){const v=value?.[area];if(v && validWeight(v.weight) && typeof v.date==='string' && !Number.isNaN(Date.parse(v.date)))result[area]={weight:Number(v.weight),date:v.date};}return result;}
export function updateData(data,draft,now){const next={...data};for(const [area,v] of Object.entries(draft)){if(!areas.includes(area))continue;if(v==='')continue;if(!validWeight(v))throw new Error('Use a weight from 0 to 200 lb in half-pound increments.');next[area]={weight:Number(v),date:now};}return next;}

export function dirtyDraft(draft,original){return Object.fromEntries(Object.entries(draft).filter(([area,value])=>value!=='' && (original[area]==='' || Number(value)!==Number(original[area]))));}
