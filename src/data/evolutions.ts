import type { SpellId } from '../types';

export interface EvolutionRecipe {
  base: SpellId;
  partner: SpellId;
  evolvedName: string;
  icon: string;
  desc: string;
  color: string;
}

export const EVOLUTION_RECIPES: EvolutionRecipe[] = [
  {
    base: 'fireball',
    partner: 'fire_tornado',
    evolvedName: '炼狱火柱',
    icon: '🌋',
    desc: '【超武进化】炎爆火球命中时喷发巨型烈焰火柱，范围 +45%，伤害大幅暴涨！',
    color: '#ff5722',
  },
  {
    base: 'frost_nova',
    partner: 'ice_lance',
    evolvedName: '极寒冰域',
    icon: '🌨️',
    desc: '【超武进化】霜冻新星范围 +45%、伤害 +55%，并深度冻结周围所有敌人！',
    color: '#5cd6ff',
  },
  {
    base: 'lightning_strike',
    partner: 'chain_lightning',
    evolvedName: '雷神裁决',
    icon: '⛈️',
    desc: '【超武进化】落雷进化为震天雷鸣冲击，范围 +50%、伤害 +45%、瞬发落雷！',
    color: '#ffe047',
  },
  {
    base: 'arcane_orbit',
    partner: 'arcane_beam',
    evolvedName: '星界天坠',
    icon: '🌠',
    desc: '【超武进化】奥术星轨转速提升并定期召唤漫天星陨轰炸战场！',
    color: '#e066ff',
  },
  {
    base: 'meteor',
    partner: 'void_hole',
    evolvedName: '坍缩超新星',
    icon: '💥',
    desc: '【超武进化】陨星砸落时引发黑洞牵引与毁灭大爆炸，范围 +50%，伤害 +55%！',
    color: '#ff4da6',
  },
  {
    base: 'holy_smite',
    partner: 'poison_cloud',
    evolvedName: '审判瘟疫',
    icon: '☣️',
    desc: '【超武进化】圣光裁决命中处留下净化毒瘴领域，伤害 +45%，回复量翻倍！',
    color: '#9eff47',
  },
];
