export type ElementType = 'none' | 'fire' | 'frost' | 'lightning' | 'shadow';

export type SpellId =
  | 'fireball'
  | 'ice_lance'
  | 'frost_nova'
  | 'lightning_strike'
  | 'arcane_orbit'
  | 'meteor'
  | 'void_hole'
  | 'holy_smite'
  | 'fire_tornado'
  | 'chain_lightning'
  | 'poison_cloud'
  | 'arcane_beam';

export type WizardId = 'pyro' | 'cryo' | 'storm' | 'arcane';

export interface WizardDef {
  id: WizardId;
  name: string;
  title: string;
  desc: string;
  passiveDesc: string;
  startSpell: SpellId;
  colorPrimary: string;
  colorAccent: string;
  colorHat: string;
  colorGlow: string;
  baseStats: {
    maxHp: number;
    speed: number;
    damageMult: number;
    cooldownMult: number;
    areaMult: number;
    critChance: number;
    pickupRadius: number;
    xpMult: number;
    burnMult: number;
    freezeMult: number;
  };
}

export interface SpellDef {
  id: SpellId;
  name: string;
  tag: string;
  desc: string;
  icon: string;
  baseColor: string;
  defaultElement: ElementType;
  baseDamage: number;
  baseCooldown: number;
  baseArea: number;
  baseCount: number;
  baseSpeed: number;
  basePierce: number;
  maxLevel: number;
}

export interface ActiveSpell {
  id: SpellId;
  level: number;
  element: ElementType;
  evolved?: boolean;
  evolvedName?: string;
  cooldownTimer: number;
  damageBonus: number;
  cooldownBonus: number;
  areaBonus: number;
  extraCount: number;
  extraPierce: number;
}

export interface PlayerState {
  wizardId: WizardId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  xp: number;
  xpToNext: number;
  level: number;
  speed: number;
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  critChance: number;
  critMult: number;
  dodgeChance: number;
  pickupRadius: number;
  xpMult: number;
  dustMult: number;
  rerollsPerLevelUp: number;
  burnMult: number;
  freezeMult: number;
  invulnTimer: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  dashTimer: number;
  dashVx: number;
  dashVy: number;
  ultCharge: number; // 0..100
  frenzyTimer: number;
  blinkNova: boolean;
  reactionDouble: boolean;
  critCdReset: boolean;
  shieldRegen: boolean;
  animTime: number;
  spells: ActiveSpell[];
  relics: Record<string, number>;
}

export type EnemyKind =
  | 'slime'
  | 'dasher'
  | 'brute'
  | 'bat'
  | 'caster'
  | 'golem'
  | 'boss_ember'
  | 'boss_storm'
  | 'boss_void';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  name?: string;
  isBoss: boolean;
  isElite: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xpValue: number;
  hitFlash: number;
  burnTimer: number;
  burnDps: number;
  poisonTimer: number;
  poisonDps: number;
  slowTimer: number;
  stunTimer: number;
  vulnerableTimer: number;
  aura: ElementType;
  auraTimer: number;
  reactionCooldown: number;
  animTime: number;
  attackTimer: number;
  specialTimer: number;
  chargeTimer: number;
  chargeVx: number;
  chargeVy: number;
  facing: number;
  knockVx: number;
  knockVy: number;
  dead: boolean;
}

export interface Projectile {
  id: number;
  fromEnemy: boolean;
  spellId?: SpellId;
  element: ElementType;
  stampKey: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  damage: number;
  pierce: number;
  life: number;
  maxLife: number;
  scale: number;
  explodeRadius?: number;
  hitIds: Set<number>;
}

export interface GroundZone {
  id: number;
  kind: 'void_hole' | 'fire_tornado' | 'poison_cloud';
  element: ElementType;
  stampKey: 'black_hole' | 'fire_tornado' | 'poison_cloud';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  tickTimer: number;
  tickInterval: number;
  life: number;
  maxLife: number;
  pullStrength: number;
  scale: number;
}

export interface ActiveBeam {
  id: number;
  spellId: SpellId;
  element: ElementType;
  angle: number;
  length: number;
  width: number;
  damage: number;
  life: number;
  maxLife: number;
  tickTimer: number;
}

export interface DelayedStrike {
  id: number;
  kind: 'meteor' | 'lightning' | 'smite' | 'starfall';
  sourceKey: string;
  element: ElementType;
  x: number;
  y: number;
  radius: number;
  damage: number;
  delay: number;
  triggered: boolean;
}

export type MapPropKind = 'shrine_frenzy' | 'spring_heal' | 'barrel';

export interface MapProp {
  id: number;
  kind: MapPropKind;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  bobPhase: number;
}

export interface BossHazard {
  id: number;
  kind: 'lightning_ring' | 'ember_slam' | 'void_blast';
  x: number;
  y: number;
  radius: number;
  damage: number;
  delay: number;
  maxDelay: number;
}

export interface Gem {
  id: number;
  kind: 'xp_small' | 'xp_med' | 'xp_large' | 'heal' | 'magnet' | 'chest' | 'boss_chest';
  x: number;
  y: number;
  value: number;
  magnetized: boolean;
  magnetSpeed: number;
  bobPhase: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  crit: boolean;
  life: number;
  maxLife: number;
}

export type ObjectiveKind = 'rune_circle' | 'void_rift' | 'star_shards';

export interface Objective {
  kind: ObjectiveKind;
  title: string;
  desc: string;
  x: number;
  y: number;
  radius: number;
  progress: number;
  active: boolean;
  completed: boolean;
  guardianId?: number;
  shards?: { x: number; y: number; collected: boolean }[];
}

export interface UpgradeChoice {
  id: string;
  kind: 'new_spell' | 'upgrade_spell' | 'infuse_element' | 'relic';
  title: string;
  subtitle: string;
  desc: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  badge: string;
  accentColor: string;
  apply: () => void;
}

export type GamePhase = 'select' | 'playing' | 'levelup' | 'paused' | 'gameover' | 'victory';
