export type TalentId =
  | 'power'
  | 'vitality'
  | 'haste'
  | 'magnet'
  | 'wisdom'
  | 'reroll'
  | 'swiftness'
  | 'greed'
  | 'evasion';

export interface TalentDef {
  id: TalentId;
  name: string;
  icon: string;
  desc: string;
  perRankLabel: string;
  maxRank: number;
  baseCost: number;
  costStep: number;
}

export const TALENTS: TalentDef[] = [
  {
    id: 'power',
    name: '秘法强化',
    icon: '⚔️',
    desc: '永久提升所有法术的基础伤害。',
    perRankLabel: '伤害 +8% / 级',
    maxRank: 5,
    baseCost: 30,
    costStep: 25,
  },
  {
    id: 'vitality',
    name: '生机涌动',
    icon: '❤️',
    desc: '永久提升巫师的初始最大生命值。',
    perRankLabel: '最大生命 +15 / 级',
    maxRank: 5,
    baseCost: 25,
    costStep: 20,
  },
  {
    id: 'haste',
    name: '极速咏唱',
    icon: '⏳',
    desc: '永久缩减所有法术与闪现的冷却时间。',
    perRankLabel: '冷却 -4% / 级',
    maxRank: 5,
    baseCost: 35,
    costStep: 30,
  },
  {
    id: 'magnet',
    name: '星界磁力',
    icon: '🧲',
    desc: '永久扩大经验球与掉落物的自动拾取范围。',
    perRankLabel: '拾取范围 +18% / 级',
    maxRank: 5,
    baseCost: 20,
    costStep: 20,
  },
  {
    id: 'wisdom',
    name: '启迪智慧',
    icon: '📚',
    desc: '永久提升击杀怪物时的经验获取效率。',
    perRankLabel: '经验效率 +12% / 级',
    maxRank: 5,
    baseCost: 25,
    costStep: 25,
  },
  {
    id: 'reroll',
    name: '命运重铸',
    icon: '🎲',
    desc: '每次升级或开启宝箱时获得额外刷新次数（基础自带 1 次）。',
    perRankLabel: '刷新次数 +1 / 级',
    maxRank: 3,
    baseCost: 45,
    costStep: 45,
  },
  {
    id: 'swiftness',
    name: '疾风步履',
    icon: '👢',
    desc: '永久提升巫师的移动速度。',
    perRankLabel: '移速 +6% / 级',
    maxRank: 5,
    baseCost: 25,
    costStep: 20,
  },
  {
    id: 'greed',
    name: '星尘共鸣',
    icon: '✨',
    desc: '永久提升每局战斗获得的星尘数量。',
    perRankLabel: '星尘收益 +20% / 级',
    maxRank: 5,
    baseCost: 30,
    costStep: 30,
  },
  {
    id: 'evasion',
    name: '幻影闪避',
    icon: '💨',
    desc: '永久提升巫师的闪避率，触发闪避时完全免疫该次伤害。',
    perRankLabel: '闪避率 +4% / 级',
    maxRank: 5,
    baseCost: 30,
    costStep: 25,
  },
];

export interface MetaSaveData {
  dust: number;
  totalKills: number;
  bestTime: number;
  ranks: Record<TalentId, number>;
}

const STORAGE_KEY = 'pixel_grimoire_meta_v1';

function defaultRanks(): Record<TalentId, number> {
  return {
    power: 0,
    vitality: 0,
    haste: 0,
    magnet: 0,
    wisdom: 0,
    reroll: 0,
    swiftness: 0,
    greed: 0,
    evasion: 0,
  };
}

export function loadMetaSave(): MetaSaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { dust: 0, totalKills: 0, bestTime: 0, ranks: defaultRanks() };
    }
    const parsed = JSON.parse(raw) as Partial<MetaSaveData>;
    return {
      dust: typeof parsed.dust === 'number' && Number.isFinite(parsed.dust) ? Math.max(0, Math.floor(parsed.dust)) : 0,
      totalKills: typeof parsed.totalKills === 'number' ? parsed.totalKills : 0,
      bestTime: typeof parsed.bestTime === 'number' ? parsed.bestTime : 0,
      ranks: { ...defaultRanks(), ...(parsed.ranks ?? {}) },
    };
  } catch {
    return { dust: 0, totalKills: 0, bestTime: 0, ranks: defaultRanks() };
  }
}

export function saveMetaSave(data: MetaSaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function getTalentCost(def: TalentDef, currentRank: number): number {
  return def.baseCost + currentRank * def.costStep;
}

export function buyTalent(save: MetaSaveData, id: TalentId): boolean {
  const def = TALENTS.find((t) => t.id === id);
  if (!def) return false;
  const rank = save.ranks[id] ?? 0;
  if (rank >= def.maxRank) return false;
  const cost = getTalentCost(def, rank);
  if (save.dust < cost) return false;
  save.dust -= cost;
  save.ranks[id] = rank + 1;
  saveMetaSave(save);
  return true;
}

export function resetTalents(save: MetaSaveData): number {
  let refunded = 0;
  for (const def of TALENTS) {
    const rank = save.ranks[def.id] ?? 0;
    for (let r = 0; r < rank; r++) {
      refunded += getTalentCost(def, r);
    }
    save.ranks[def.id] = 0;
  }
  save.dust += refunded;
  saveMetaSave(save);
  return refunded;
}

export interface MetaBonuses {
  damageBonus: number;
  hpBonus: number;
  cooldownMult: number;
  pickupMult: number;
  xpBonus: number;
  extraRerolls: number;
  speedMult: number;
  dustMult: number;
  dodgeBonus: number;
}

export function getMetaBonuses(save: MetaSaveData): MetaBonuses {
  const r = save.ranks;
  return {
    damageBonus: (r.power ?? 0) * 0.08,
    hpBonus: (r.vitality ?? 0) * 15,
    cooldownMult: Math.max(0.65, 1 - (r.haste ?? 0) * 0.04),
    pickupMult: 1 + (r.magnet ?? 0) * 0.18,
    xpBonus: (r.wisdom ?? 0) * 0.12,
    extraRerolls: r.reroll ?? 0,
    speedMult: 1 + (r.swiftness ?? 0) * 0.06,
    dustMult: 1 + (r.greed ?? 0) * 0.2,
    dodgeBonus: (r.evasion ?? 0) * 0.04,
  };
}
