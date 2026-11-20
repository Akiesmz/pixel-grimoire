export type AchievementId =
  | 'first_blood'
  | 'slayer_500'
  | 'first_evo'
  | 'reaction_master'
  | 'boss_ember'
  | 'boss_void'
  | 'dodge_king'
  | 'survivor_5m';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  icon: string;
  desc: string;
  rewardDust: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_blood',
    name: '初出茅庐',
    icon: '⚔️',
    desc: '单局击杀 100 名敌人',
    rewardDust: 30,
  },
  {
    id: 'slayer_500',
    name: '魔潮收割者',
    icon: '💀',
    desc: '单局击杀 500 名敌人',
    rewardDust: 80,
  },
  {
    id: 'first_evo',
    name: '超武觉醒',
    icon: '🌟',
    desc: '首次完成任意法术的超武进化',
    rewardDust: 60,
  },
  {
    id: 'reaction_master',
    name: '元素交响曲',
    icon: '⚡',
    desc: '单局触发 30 次元素反应',
    rewardDust: 50,
  },
  {
    id: 'boss_ember',
    name: '炎魔克星',
    icon: '🔥',
    desc: '击败 3 分钟首领「烈焰领主」',
    rewardDust: 60,
  },
  {
    id: 'boss_void',
    name: '终焉主宰',
    icon: '👑',
    desc: '击败最终首领「虚空大君」',
    rewardDust: 150,
  },
  {
    id: 'dodge_king',
    name: '幻影行者',
    icon: '💨',
    desc: '单局成功闪避 15 次伤害',
    rewardDust: 50,
  },
  {
    id: 'survivor_5m',
    name: '星界坚守者',
    icon: '⏳',
    desc: '单局存活超过 5 分钟',
    rewardDust: 60,
  },
];

const ACH_KEY = 'pixel_grimoire_achievements_v1';

export function loadUnlockedAchievements(): Set<AchievementId> {
  try {
    const raw = localStorage.getItem(ACH_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as AchievementId[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveUnlockedAchievements(set: Set<AchievementId>): void {
  try {
    localStorage.setItem(ACH_KEY, JSON.stringify([...set]));
  } catch {
    // Ignore storage errors
  }
}
