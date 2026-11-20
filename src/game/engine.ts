import { sound } from '../audio';
import { ELEMENT_INFO, SPELL_MAP, SPELLS } from '../data/spells';
import {
  buyTalent as buyTalentInSave,
  getMetaBonuses,
  loadMetaSave,
  resetTalents as resetTalentsInSave,
  saveMetaSave,
  type MetaSaveData,
  type TalentId,
} from '../data/talents';
import { WIZARD_MAP } from '../data/wizards';
import { PixelFxManager } from '../fx/pixelfxManager';
import { drawArenaGround, drawEnemy, drawGem, drawWizard } from '../render/sprites';
import type {
  ActiveBeam,
  ActiveSpell,
  DelayedStrike,
  ElementType,
  Enemy,
  EnemyKind,
  FloatingText,
  GamePhase,
  Gem,
  GroundZone,
  Objective,
  PlayerState,
  Projectile,
  SpellId,
  UpgradeChoice,
  WizardId,
} from '../types';

export const VIEW_W = 480;
export const VIEW_H = 270;

export interface HudSnapshot {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  xp: number;
  xpToNext: number;
  level: number;
  elapsed: number;
  kills: number;
  runDust: number;
  totalDust: number;
  wave: number;
  dashReadyRatio: number;
  manualAim: boolean;
  muted: boolean;
  spells: ActiveSpell[];
  boss: { name: string; hp: number; maxHp: number } | null;
  objective: { title: string; desc: string; progress: number } | null;
  banner: string | null;
  endless: boolean;
  wizardName: string;
  stats: {
    damagePct: number;
    cooldownPct: number;
    areaPct: number;
    critPct: number;
    speed: number;
    xpPct: number;
    pickupRadius: number;
    rerollsPerLevelUp: number;
  };
}

interface OrbitHitRecord {
  enemyId: number;
  cooldown: number;
}

interface ChainArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

export class GameEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fx: PixelFxManager;

  public phase: GamePhase = 'select';
  private rafId = 0;
  private lastTime = 0;

  private keys = new Set<string>();
  private touchMoveX = 0;
  private touchMoveY = 0;
  private mouseScreenX = VIEW_W / 2;
  private mouseScreenY = VIEW_H / 2;
  private manualAim = false;

  private player!: PlayerState;
  private camX = 0;
  private camY = 0;
  private shakeTimer = 0;
  private shakeAmp = 0;
  private hitStopTimer = 0;

  private elapsed = 0;
  private kills = 0;
  private runDust = 0;
  private dustRemainder = 0;
  private runSavedDust = 0;
  private metaSave: MetaSaveData;
  private endless = false;
  private nextEntityId = 1;

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private zones: GroundZone[] = [];
  private beams: ActiveBeam[] = [];
  private delayedStrikes: DelayedStrike[] = [];
  private gems: Gem[] = [];
  private texts: FloatingText[] = [];
  private chainArcs: ChainArc[] = [];
  private orbitHitCooldowns = new Map<number, number>();
  private orbitAngle = 0;
  private holyCastCount = 0;
  private pickupPulseTimer = 0;

  private spawnTimer = 0;
  private bossSpawned = [false, false, false];
  private nextObjectiveTime = 35;
  private objective: Objective | null = null;
  private bannerText: string | null = null;
  private bannerTimer = 0;

  private currentUpgradeTitle = '';
  private currentRerollsLeft = 0;

  private onHudUpdate: (snap: HudSnapshot) => void;
  private onLevelUpChoices: (choices: UpgradeChoice[], title: string, rerollsLeft: number) => void;
  private hudSyncTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: {
      onHudUpdate: (snap: HudSnapshot) => void;
      onLevelUpChoices: (choices: UpgradeChoice[], title: string, rerollsLeft: number) => void;
    }
  ) {
    this.canvas = canvas;
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.metaSave = loadMetaSave();
    this.fx = new PixelFxManager(VIEW_W, VIEW_H);
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onLevelUpChoices = callbacks.onLevelUpChoices;

    this.bindInputs();
    this.initPlayer('pyro');
    this.startLoop();
  }

  public getMetaSave(): MetaSaveData {
    return this.metaSave;
  }

  public purchaseTalent(id: TalentId): boolean {
    const ok = buyTalentInSave(this.metaSave, id);
    if (ok) {
      sound.playLevelUp();
      this.pushHud();
    }
    return ok;
  }

  public resetAllTalents(): number {
    const refunded = resetTalentsInSave(this.metaSave);
    if (refunded > 0) {
      sound.playGem();
      this.pushHud();
    }
    return refunded;
  }

  private addDust(baseAmount: number): void {
    const exact = baseAmount * this.player.dustMult + this.dustRemainder;
    const whole = Math.floor(exact);
    this.dustRemainder = exact - whole;
    if (whole > 0) {
      this.runDust += whole;
    }
  }

  private flushRunDustToSave(): void {
    const delta = this.runDust - this.runSavedDust;
    if (delta > 0) {
      this.metaSave.dust += delta;
      this.runSavedDust = this.runDust;
    }
    if (this.elapsed > this.metaSave.bestTime) {
      this.metaSave.bestTime = Math.floor(this.elapsed);
    }
    saveMetaSave(this.metaSave);
  }

  private bindInputs(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keys.add(code);

      if (this.phase === 'playing') {
        if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
          e.preventDefault();
          this.tryDash();
        } else if (code === 'KeyM') {
          this.toggleAimMode();
        } else if (code === 'Escape' || code === 'KeyP') {
          this.togglePause();
        }
      } else if (this.phase === 'paused') {
        if (code === 'Escape' || code === 'KeyP') {
          this.togglePause();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchMoveX = 0;
      this.touchMoveY = 0;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.mouseScreenX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      this.mouseScreenY = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    });
  }

  private initPlayer(wizardId: WizardId): void {
    const wiz = WIZARD_MAP[wizardId];
    const s = wiz.baseStats;
    const startSpellDef = SPELL_MAP[wiz.startSpell];
    const meta = getMetaBonuses(this.metaSave);
    const maxHp = s.maxHp + meta.hpBonus;

    this.player = {
      wizardId,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      aimAngle: 0,
      hp: maxHp,
      maxHp,
      xp: 0,
      xpToNext: 34,
      level: 1,
      speed: Math.round(s.speed * meta.speedMult),
      damageMult: s.damageMult + meta.damageBonus,
      cooldownMult: s.cooldownMult * meta.cooldownMult,
      areaMult: s.areaMult,
      critChance: s.critChance,
      critMult: 1.75,
      pickupRadius: Math.round(s.pickupRadius * meta.pickupMult),
      xpMult: s.xpMult + meta.xpBonus,
      dustMult: meta.dustMult,
      rerollsPerLevelUp: 1 + meta.extraRerolls,
      burnMult: s.burnMult,
      freezeMult: s.freezeMult,
      invulnTimer: 0,
      dashCooldown: 0,
      dashMaxCooldown: Math.max(1.2, 2.5 * meta.cooldownMult),
      dashTimer: 0,
      dashVx: 0,
      dashVy: 0,
      animTime: 0,
      spells: [
        {
          id: wiz.startSpell,
          level: 1,
          element: startSpellDef.defaultElement,
          cooldownTimer: 0.35,
          damageBonus: 0,
          cooldownBonus: 0,
          areaBonus: 0,
          extraCount: 0,
          extraPierce: 0,
        },
      ],
      relics: {},
    };
  }

  public startRun(wizardId: WizardId): void {
    this.initPlayer(wizardId);
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.beams = [];
    this.delayedStrikes = [];
    this.gems = [];
    this.texts = [];
    this.chainArcs = [];
    this.orbitHitCooldowns.clear();
    this.fx.clearAll();

    this.elapsed = 0;
    this.kills = 0;
    this.runDust = 0;
    this.dustRemainder = 0;
    this.runSavedDust = 0;
    this.endless = false;
    this.spawnTimer = 0.5;
    this.bossSpawned = [false, false, false];
    this.nextObjectiveTime = 32;
    this.objective = null;
    this.holyCastCount = 0;
    this.pickupPulseTimer = 0;
    this.camX = this.player.x - VIEW_W / 2;
    this.camY = this.player.y - VIEW_H / 2;

    this.phase = 'playing';
    this.showBanner(`⚔️ ${WIZARD_MAP[wizardId].name} 出击！存活并击败虚空大君`, 3.2);
    this.fx.spawnWorld('mana_burst', this.player.x, this.player.y, { priority: 4 });
    sound.playLevelUp();
    this.pushHud();
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.pushHud();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.lastTime = performance.now();
      this.pushHud();
    }
  }

  public toggleAimMode(): void {
    this.manualAim = !this.manualAim;
    this.showBanner(this.manualAim ? '🎯 已切换：鼠标手动瞄准' : '✨ 已切换：自动锁定最近敌人', 1.8);
    this.pushHud();
  }

  public toggleMute(): boolean {
    const muted = sound.toggleMute();
    this.pushHud();
    return muted;
  }

  public continueEndless(): void {
    if (this.phase !== 'victory') return;
    this.endless = true;
    this.phase = 'playing';
    this.showBanner('♾️ 无尽模式开启！敌群强度持续飙升', 3.0);
    this.pushHud();
  }

  public returnToSelect(): void {
    this.flushRunDustToSave();
    this.phase = 'select';
    this.pushHud();
  }

  private showBanner(text: string, duration = 2.6): void {
    this.bannerText = text;
    this.bannerTimer = duration;
  }

  private addShake(amp: number, duration: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  private startLoop(): void {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;

      if (this.phase === 'playing') {
        if (this.hitStopTimer > 0) {
          this.hitStopTimer -= rawDt;
        } else {
          this.update(rawDt);
        }
      } else {
        // Gentle background animation on select screen
        if (this.phase === 'select') {
          this.elapsed += rawDt;
        }
      }

      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  public triggerDash(): void {
    if (this.phase === 'playing') {
      this.tryDash();
    }
  }

  private tryDash(): void {
    const p = this.player;
    if (p.dashCooldown > 0 || p.dashTimer > 0) return;

    let dx = this.touchMoveX;
    let dy = this.touchMoveY;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;

    const len = Math.hypot(dx, dy);
    if (len < 0.08) {
      dx = Math.cos(p.aimAngle);
      dy = Math.sin(p.aimAngle);
    } else {
      dx /= len;
      dy /= len;
    }

    this.fx.spawnWorld('blink_out', p.x, p.y, { priority: 4 });
    p.dashVx = dx * 290;
    p.dashVy = dy * 290;
    p.dashTimer = 0.16;
    p.dashCooldown = p.dashMaxCooldown;
    p.invulnTimer = Math.max(p.invulnTimer, 0.28);
    sound.playDash();
  }

  private update(dt: number): void {
    this.elapsed += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerText = null;
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) this.shakeAmp = 0;
    }

    this.updatePlayer(dt);
    this.updateSpawner(dt);
    this.updateObjectives(dt);
    this.updateSpells(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateBeams(dt);
    this.updateDelayedStrikes(dt);
    this.updateEnemies(dt);
    this.updateGems(dt);
    this.updateTextsAndArcs(dt);
    this.fx.update(dt);
    if (this.pickupPulseTimer > 0) this.pickupPulseTimer = Math.max(0, this.pickupPulseTimer - dt);

    // Smooth camera tracking
    const targetCamX = this.player.x - VIEW_W / 2;
    const targetCamY = this.player.y - VIEW_H / 2;
    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 10);
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 10);

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.pushHud();
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    if (p.invulnTimer > 0) p.invulnTimer -= dt;
    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.dashVx * dt;
      p.y += p.dashVy * dt;
      if (p.dashTimer <= 0) {
        this.fx.spawnWorld('blink_in', p.x, p.y, { priority: 4 });
      }
      return;
    }

    let ix = this.touchMoveX;
    let iy = this.touchMoveY;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;

    const inputLen = Math.hypot(ix, iy);
    if (inputLen > 0.06) {
      const clampedMag = Math.min(1, inputLen);
      const nx = ix / inputLen;
      const ny = iy / inputLen;
      p.vx = nx * p.speed * clampedMag;
      p.vy = ny * p.speed * clampedMag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.animTime += dt;
      if (Math.abs(nx) > 0.1) p.facing = nx > 0 ? 1 : -1;
    } else {
      p.vx = 0;
      p.vy = 0;
    }

    // Update aimAngle
    if (this.manualAim) {
      const worldMx = this.camX + this.mouseScreenX;
      const worldMy = this.camY + this.mouseScreenY;
      p.aimAngle = Math.atan2(worldMy - p.y, worldMx - p.x);
    } else {
      const nearest = this.findNearestEnemy(p.x, p.y, 260);
      if (nearest) {
        p.aimAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      } else if (ix !== 0 || iy !== 0) {
        p.aimAngle = Math.atan2(iy, ix);
      }
    }
  }

  private getWaveNumber(): number {
    return Math.floor(this.elapsed / 45) + 1;
  }

  private updateSpawner(dt: number): void {
    const t = this.elapsed;

    // Boss milestones: 3:00, 6:00, 9:00
    if (t >= 180 && !this.bossSpawned[0]) {
      this.bossSpawned[0] = true;
      this.spawnBoss('boss_ember', '烈焰领主 · 炎魔之王');
    } else if (t >= 360 && !this.bossSpawned[1]) {
      this.bossSpawned[1] = true;
      this.spawnBoss('boss_storm', '霜雷巨像 · 极寒雷神');
    } else if (t >= 540 && !this.bossSpawned[2]) {
      this.bossSpawned[2] = true;
      this.spawnBoss('boss_void', '虚空大君 · 终焉法皇');
    }

    const levelFactor = Math.max(0, this.player.level - 1);
    const maxEnemies = Math.min(200, 28 + Math.floor(t * 0.28) + levelFactor * 6);
    if (this.enemies.length >= maxEnemies) return;

    const interval = Math.max(0.16, 1.0 - t * 0.0014 - levelFactor * 0.025);
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = interval;

    const batchSize = 1 + Math.floor(t / 65) + Math.floor(levelFactor / 3);
    for (let i = 0; i < batchSize; i++) {
      this.spawnRegularEnemy(t);
    }
  }

  private spawnRegularEnemy(t: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 270 + Math.random() * 60;
    const x = this.player.x + Math.cos(angle) * dist;
    const y = this.player.y + Math.sin(angle) * dist;

    const r = Math.random();
    let kind: EnemyKind = 'slime';
    if (t < 45) {
      kind = r < 0.78 ? 'slime' : 'bat';
    } else if (t < 110) {
      kind = r < 0.45 ? 'slime' : r < 0.72 ? 'bat' : 'dasher';
    } else if (t < 200) {
      kind = r < 0.3 ? 'slime' : r < 0.52 ? 'dasher' : r < 0.76 ? 'bat' : r < 0.92 ? 'brute' : 'caster';
    } else {
      kind =
        r < 0.2
          ? 'slime'
          : r < 0.4
            ? 'dasher'
            : r < 0.58
              ? 'bat'
              : r < 0.76
                ? 'brute'
                : r < 0.92
                  ? 'caster'
                  : 'golem';
    }

    const isElite = (kind === 'golem' && Math.random() < 0.25) || (t > 90 && Math.random() < 0.025);
    this.createEnemy(kind, x, y, isElite, false);
  }

  private spawnBoss(kind: EnemyKind, name: string): void {
    const angle = Math.random() * Math.PI * 2;
    const x = this.player.x + Math.cos(angle) * 230;
    const y = this.player.y + Math.sin(angle) * 180;
    this.createEnemy(kind, x, y, true, true, name);
    this.showBanner(`⚠️ 首领降临：${name}`, 4.0);
    this.addShake(4, 0.45);
    this.fx.spawnWorld('dark_explosion', x, y, { priority: 5 });
    sound.playExplosion(true);
  }

  private createEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    isElite: boolean,
    isBoss: boolean,
    name?: string
  ): Enemy {
    const timeScale = 1 + this.elapsed / 120 + (this.endless ? (this.elapsed - 540) / 80 : 0);

    const baseTable: Record<
      EnemyKind,
      { hp: number; speed: number; dmg: number; radius: number; xp: number }
    > = {
      slime: { hp: 24, speed: 34, dmg: 8, radius: 7, xp: 5 },
      bat: { hp: 16, speed: 58, dmg: 7, radius: 6, xp: 6 },
      dasher: { hp: 32, speed: 54, dmg: 11, radius: 7, xp: 9 },
      brute: { hp: 78, speed: 28, dmg: 16, radius: 11, xp: 16 },
      caster: { hp: 42, speed: 32, dmg: 12, radius: 8, xp: 15 },
      golem: { hp: 145, speed: 24, dmg: 20, radius: 13, xp: 34 },
      boss_ember: { hp: 1450, speed: 38, dmg: 24, radius: 19, xp: 140 },
      boss_storm: { hp: 2600, speed: 44, dmg: 28, radius: 20, xp: 200 },
      boss_void: { hp: 4200, speed: 46, dmg: 32, radius: 22, xp: 300 },
    };

    const cfg = baseTable[kind];
    const eliteMult = isElite && !isBoss ? 2.4 : 1;
    const lv = Math.max(1, this.player.level);
    const levelHpScale = 1 + (lv - 1) * 0.16 + Math.pow(Math.max(0, lv - 5), 1.3) * 0.04;
    const maxHp = Math.round(cfg.hp * timeScale * levelHpScale * eliteMult);

    const enemy: Enemy = {
      id: this.nextEntityId++,
      kind,
      name,
      isBoss,
      isElite,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: isElite && !isBoss ? cfg.radius + 2 : cfg.radius,
      hp: maxHp,
      maxHp,
      speed: cfg.speed * (isBoss ? 1 : 0.94 + Math.random() * 0.12),
      damage: Math.round(cfg.dmg * (1 + this.elapsed / 360)),
      xpValue: Math.round(cfg.xp * (isElite && !isBoss ? 3 : 1)),
      hitFlash: 0,
      burnTimer: 0,
      burnDps: 0,
      poisonTimer: 0,
      poisonDps: 0,
      slowTimer: 0,
      stunTimer: 0,
      animTime: Math.random() * 10,
      attackTimer: 1.5 + Math.random() * 1.5,
      facing: 1,
      knockVx: 0,
      knockVy: 0,
      dead: false,
    };

    this.enemies.push(enemy);
    return enemy;
  }

  private updateObjectives(dt: number): void {
    if (!this.objective && this.elapsed >= this.nextObjectiveTime) {
      this.spawnObjective();
    }

    const obj = this.objective;
    if (!obj || !obj.active) return;

    if (obj.kind === 'rune_circle') {
      const d = Math.hypot(this.player.x - obj.x, this.player.y - obj.y);
      if (d <= obj.radius) {
        obj.progress = Math.min(1, obj.progress + dt * 0.14);
        if (obj.progress >= 1) this.completeObjective(obj);
      }
    } else if (obj.kind === 'void_rift') {
      const guard = this.enemies.find((e) => e.id === obj.guardianId && !e.dead);
      if (!guard) {
        obj.progress = 1;
        this.completeObjective(obj);
      } else {
        obj.progress = Math.max(0, 1 - guard.hp / guard.maxHp);
      }
    } else if (obj.kind === 'star_shards' && obj.shards) {
      let collected = 0;
      for (const s of obj.shards) {
        if (!s.collected && Math.hypot(this.player.x - s.x, this.player.y - s.y) <= 22) {
          s.collected = true;
          sound.playGem();
          this.fx.spawnWorld('hit_spark', s.x, s.y, { element: 'lightning', priority: 3 });
        }
        if (s.collected) collected++;
      }
      obj.progress = collected / obj.shards.length;
      if (collected >= obj.shards.length) {
        this.completeObjective(obj);
      }
    }
  }

  private spawnObjective(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 170 + Math.random() * 60;
    const ox = this.player.x + Math.cos(angle) * dist;
    const oy = this.player.y + Math.sin(angle) * dist;

    const roll = Math.random();
    if (roll < 0.36) {
      this.objective = {
        kind: 'rune_circle',
        title: '任务：充能符文法阵',
        desc: '站在发光法阵内直至充能 100%',
        x: ox,
        y: oy,
        radius: 42,
        progress: 0,
        active: true,
        completed: false,
      };
    } else if (roll < 0.7) {
      const guardian = this.createEnemy('golem', ox, oy, true, false, '裂隙守卫');
      this.objective = {
        kind: 'void_rift',
        title: '任务：净化虚空裂隙',
        desc: '击败守护裂隙的精英魔像',
        x: ox,
        y: oy,
        radius: 36,
        progress: 0,
        active: true,
        completed: false,
        guardianId: guardian.id,
      };
    } else {
      const shards = Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
        const r = 38 + Math.random() * 35;
        return { x: ox + Math.cos(a) * r, y: oy + Math.sin(a) * r, collected: false };
      });
      this.objective = {
        kind: 'star_shards',
        title: '任务：收集星辰碎片',
        desc: '前往标记区域收集 4 枚星辰碎片',
        x: ox,
        y: oy,
        radius: 65,
        progress: 0,
        active: true,
        completed: false,
        shards,
      };
    }

    this.showBanner(`📜 新任务出现：${this.objective.title}`, 3.0);
  }

  private completeObjective(obj: Objective): void {
    obj.active = false;
    obj.completed = true;
    this.objective = null;
    this.nextObjectiveTime = this.elapsed + 45;

    this.fx.spawnWorld('mana_burst', obj.x, obj.y, { priority: 5 });
    this.fx.spawnWorld('heal_aoe', this.player.x, this.player.y, { priority: 4 });
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
    this.addDust(20);
    this.flushRunDustToSave();
    sound.playObjectiveComplete();

    // Drop golden relic chest at objective center
    this.gems.push({
      id: this.nextEntityId++,
      kind: 'chest',
      x: obj.x,
      y: obj.y,
      value: 1,
      magnetized: false,
      magnetSpeed: 0,
      bobPhase: Math.random() * 6,
    });

    this.showBanner('🏆 任务完成！获得星尘、金色宝箱并回复 20 生命', 3.2);
  }

  private updateSpells(dt: number): void {
    const p = this.player;

    // Update orbit hit cooldowns
    for (const [id, cd] of this.orbitHitCooldowns.entries()) {
      if (cd - dt <= 0) this.orbitHitCooldowns.delete(id);
      else this.orbitHitCooldowns.set(id, cd - dt);
    }

    for (const spell of p.spells) {
      if (spell.id === 'arcane_orbit') {
        this.updateArcaneOrbit(spell, dt);
        continue;
      }

      spell.cooldownTimer -= dt;
      if (spell.cooldownTimer <= 0) {
        const def = SPELL_MAP[spell.id];
        const cdReduction = Math.min(0.65, spell.cooldownBonus);
        const cd = Math.max(0.22, def.baseCooldown * (1 - cdReduction) * p.cooldownMult);
        spell.cooldownTimer = cd;
        this.castSpell(spell);
      }
    }
  }

  private getSpellStats(spell: ActiveSpell) {
    const def = SPELL_MAP[spell.id];
    const p = this.player;
    const damage = def.baseDamage * (1 + spell.damageBonus) * p.damageMult;
    const area = def.baseArea * (1 + spell.areaBonus) * p.areaMult;
    const count = def.baseCount + spell.extraCount;
    const pierce = def.basePierce + spell.extraPierce;
    return { def, damage, area, count, pierce };
  }

  private updateArcaneOrbit(spell: ActiveSpell, dt: number): void {
    const { def, damage, area, count } = this.getSpellStats(spell);
    this.orbitAngle += def.baseSpeed * dt;

    for (let i = 0; i < count; i++) {
      const a = this.orbitAngle + (i / count) * Math.PI * 2;
      const ox = this.player.x + Math.cos(a) * area;
      const oy = this.player.y + Math.sin(a) * area;

      for (const e of this.enemies) {
        if (e.dead || this.orbitHitCooldowns.has(e.id)) continue;
        const d = Math.hypot(e.x - ox, e.y - oy);
        if (d <= e.radius + 11) {
          this.orbitHitCooldowns.set(e.id, 0.34);
          this.damageEnemy(e, damage, spell.element, ox, oy, 45);
        }
      }
    }
  }

  private castSpell(spell: ActiveSpell): void {
    const p = this.player;
    const { def, damage, area, count, pierce } = this.getSpellStats(spell);

    if (spell.id === 'fireball') {
      sound.playCast(340);
      const baseAngle = p.aimAngle;
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.22;
        const a = baseAngle + spread;
        this.projectiles.push({
          id: this.nextEntityId++,
          fromEnemy: false,
          spellId: 'fireball',
          element: spell.element,
          stampKey: 'fireball',
          x: p.x + Math.cos(a) * 10,
          y: p.y + Math.sin(a) * 10,
          vx: Math.cos(a) * def.baseSpeed,
          vy: Math.sin(a) * def.baseSpeed,
          angle: a,
          radius: 9,
          damage,
          pierce,
          life: 2.0,
          maxLife: 2.0,
          scale: 0.65,
          explodeRadius: area,
          hitIds: new Set(),
        });
      }
    } else if (spell.id === 'ice_lance') {
      sound.playCast(580);
      const baseAngle = p.aimAngle;
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.16;
        const a = baseAngle + spread;
        this.projectiles.push({
          id: this.nextEntityId++,
          fromEnemy: false,
          spellId: 'ice_lance',
          element: spell.element,
          stampKey: 'ice_lance',
          x: p.x + Math.cos(a) * 10,
          y: p.y + Math.sin(a) * 10,
          vx: Math.cos(a) * def.baseSpeed,
          vy: Math.sin(a) * def.baseSpeed,
          angle: a,
          radius: 8,
          damage,
          pierce,
          life: 1.7,
          maxLife: 1.7,
          scale: 0.62,
          hitIds: new Set(),
        });
      }
    } else if (spell.id === 'frost_nova') {
      sound.playExplosion(false);
      this.fx.spawnWorld('frost_nova', p.x, p.y, {
        element: spell.element === 'frost' ? 'none' : spell.element,
        priority: 4,
      });
      this.addShake(2.2, 0.18);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= area + e.radius) {
          this.damageEnemy(e, damage, spell.element, p.x, p.y, 130);
          e.slowTimer = Math.max(e.slowTimer, 2.5 * p.freezeMult);
        }
      }
    } else if (spell.id === 'lightning_strike') {
      const targets = this.pickClusterTargets(count, 230);
      if (targets.length === 0) return;
      sound.playLightning();
      for (const target of targets) {
        this.fx.spawnWorld('lightning_strike', target.x, target.y + 6, {
          element: spell.element === 'lightning' ? 'none' : spell.element,
          priority: 4,
        });
        this.delayedStrikes.push({
          id: this.nextEntityId++,
          kind: 'lightning',
          element: spell.element,
          x: target.x,
          y: target.y,
          radius: area,
          damage,
          delay: 0.45,
          triggered: false,
        });
      }
    } else if (spell.id === 'meteor') {
      const targets = this.pickClusterTargets(count, 240);
      if (targets.length === 0) return;
      sound.playCast(220);
      for (const target of targets) {
        this.fx.spawnWorld('meteor', target.x, target.y + 8, {
          element: spell.element === 'fire' ? 'none' : spell.element,
          priority: 5,
        });
        this.delayedStrikes.push({
          id: this.nextEntityId++,
          kind: 'meteor',
          element: spell.element,
          x: target.x,
          y: target.y,
          radius: area,
          damage,
          delay: 0.72,
          triggered: false,
        });
      }
    } else if (spell.id === 'void_hole') {
      const targets = this.pickClusterTargets(count, 220);
      if (targets.length === 0) return;
      sound.playCast(190);
      for (const target of targets) {
        this.zones.push({
          id: this.nextEntityId++,
          kind: 'void_hole',
          element: spell.element,
          stampKey: 'black_hole',
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          radius: area,
          damage,
          tickTimer: 0.2,
          tickInterval: 0.42,
          life: 3.4,
          maxLife: 3.4,
          pullStrength: 68,
          scale: 0.72,
        });
      }
    } else if (spell.id === 'fire_tornado') {
      sound.playCast(300);
      for (let i = 0; i < count; i++) {
        const a = p.aimAngle + (i - (count - 1) / 2) * 0.65;
        this.zones.push({
          id: this.nextEntityId++,
          kind: 'fire_tornado',
          element: spell.element,
          stampKey: 'fire_tornado',
          x: p.x + Math.cos(a) * 28,
          y: p.y + Math.sin(a) * 28,
          vx: Math.cos(a) * def.baseSpeed,
          vy: Math.sin(a) * def.baseSpeed,
          radius: area,
          damage,
          tickTimer: 0.1,
          tickInterval: 0.28,
          life: 4.5,
          maxLife: 4.5,
          pullStrength: 24,
          scale: 0.68,
        });
      }
    } else if (spell.id === 'chain_lightning') {
      const first = this.findNearestEnemy(p.x, p.y, 230);
      if (!first) return;
      sound.playLightning();
      const hitSet = new Set<number>();
      let currX = p.x;
      let currY = p.y - 6;
      let currentTarget: Enemy | null = first;
      const maxHops = count;
      const arcColor = spell.element !== 'none' ? ELEMENT_INFO[spell.element].color : '#99e6ff';

      for (let hop = 0; hop < maxHops && currentTarget; hop++) {
        hitSet.add(currentTarget.id);
        this.chainArcs.push({
          x1: currX,
          y1: currY,
          x2: currentTarget.x,
          y2: currentTarget.y,
          life: 0.22,
          color: arcColor,
        });
        this.fx.spawnWorld('zap_hit', currentTarget.x, currentTarget.y, {
          element: spell.element === 'lightning' ? 'none' : spell.element,
          priority: 2,
        });
        const falloff = Math.pow(0.92, hop);
        this.damageEnemy(currentTarget, damage * falloff, spell.element, currX, currY, 35);
        currX = currentTarget.x;
        currY = currentTarget.y;

        // Find next closest unhit enemy within jump range
        let nextTarget: Enemy | null = null;
        let bestD = area;
        for (const cand of this.enemies) {
          if (cand.dead || hitSet.has(cand.id)) continue;
          const d = Math.hypot(cand.x - currX, cand.y - currY);
          if (d < bestD) {
            bestD = d;
            nextTarget = cand;
          }
        }
        currentTarget = nextTarget;
      }
    } else if (spell.id === 'poison_cloud') {
      const targets = this.pickClusterTargets(count, 210);
      if (targets.length === 0) return;
      sound.playCast(240);
      for (const target of targets) {
        this.zones.push({
          id: this.nextEntityId++,
          kind: 'poison_cloud',
          element: spell.element,
          stampKey: 'poison_cloud',
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          radius: area,
          damage,
          tickTimer: 0.15,
          tickInterval: 0.45,
          life: 4.8,
          maxLife: 4.8,
          pullStrength: 0,
          scale: 0.66,
        });
      }
    } else if (spell.id === 'arcane_beam') {
      sound.playCast(720);
      for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : (i / count) * Math.PI * 2;
        this.beams.push({
          id: this.nextEntityId++,
          element: spell.element,
          angle: p.aimAngle + offset,
          length: area,
          width: 14,
          damage,
          life: 1.2,
          maxLife: 1.2,
          tickTimer: 0.05,
        });
      }
    } else if (spell.id === 'holy_smite') {
      const targets = this.pickClusterTargets(count, 230, true);
      if (targets.length === 0) return;
      sound.playCast(660);
      this.holyCastCount++;
      for (const target of targets) {
        this.fx.spawnWorld('smite', target.x, target.y + 8, {
          element: spell.element,
          priority: 4,
        });
        this.delayedStrikes.push({
          id: this.nextEntityId++,
          kind: 'smite',
          element: spell.element,
          x: target.x,
          y: target.y,
          radius: area,
          damage,
          delay: 0.42,
          triggered: false,
        });
      }
      if (this.holyCastCount % 3 === 0 && p.hp < p.maxHp) {
        const healAmt = 8 + Math.floor(spell.level * 1.5);
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        this.fx.spawnWorld('heal_aoe', p.x, p.y, { priority: 3 });
        this.spawnText(p.x, p.y - 14, `+${healAmt}`, '#69ff94', false);
      }
    }
  }

  private pickClusterTargets(count: number, maxRange: number, preferElite = false): Enemy[] {
    const candidates = this.enemies.filter(
      (e) => !e.dead && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= maxRange
    );
    if (candidates.length === 0) return [];

    if (preferElite) {
      candidates.sort((a, b) => Number(b.isBoss || b.isElite) - Number(a.isBoss || a.isElite));
    } else {
      // Shuffle slightly for variety
      candidates.sort(() => Math.random() - 0.5);
    }

    const picked: Enemy[] = [];
    for (const c of candidates) {
      if (picked.length >= count) break;
      picked.push(c);
    }
    return picked;
  }

  private updateDelayedStrikes(dt: number): void {
    for (let i = this.delayedStrikes.length - 1; i >= 0; i--) {
      const s = this.delayedStrikes[i];
      s.delay -= dt;
      if (s.delay <= 0) {
        this.delayedStrikes.splice(i, 1);
        if (s.kind === 'meteor') {
          this.addShake(4.2, 0.28);
          sound.playExplosion(true);
        } else if (s.kind === 'lightning') {
          this.addShake(2.2, 0.14);
          sound.playLightning();
        } else {
          this.addShake(2.4, 0.16);
          sound.playExplosion(false);
        }

        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d <= s.radius + e.radius) {
            this.damageEnemy(e, s.damage, s.element, s.x, s.y, s.kind === 'meteor' ? 110 : 50);
            if (s.kind === 'lightning') {
              e.stunTimer = Math.max(e.stunTimer, 0.55);
            }
          }
        }
      }
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      z.tickTimer -= dt;

      // Fire tornadoes actively seek nearby enemies!
      if (z.kind === 'fire_tornado') {
        const nearest = this.findNearestEnemy(z.x, z.y, 180);
        if (nearest) {
          const dx = nearest.x - z.x;
          const dy = nearest.y - z.y;
          const d = Math.hypot(dx, dy) || 1;
          const speed = Math.hypot(z.vx, z.vy) || 54;
          z.vx += ((dx / d) * speed - z.vx) * Math.min(1, dt * 3.2);
          z.vy += ((dy / d) * speed - z.vy) * Math.min(1, dt * 3.2);
        }
        z.x += z.vx * dt;
        z.y += z.vy * dt;
      }

      // Pull enemies inward (void hole & fire tornado swirl)
      if (z.pullStrength > 0) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dx = z.x - e.x;
          const dy = z.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d > 4 && d <= z.radius * 1.45) {
            const pull = (e.isBoss ? 0.25 : 1) * z.pullStrength * dt;
            e.x += (dx / d) * pull;
            e.y += (dy / d) * pull;
          }
        }
      }

      if (z.tickTimer <= 0) {
        z.tickTimer = z.tickInterval;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + e.radius) {
            this.damageEnemy(e, z.damage, z.element, z.x, z.y, z.kind === 'fire_tornado' ? 28 : 8);
            if (z.kind === 'poison_cloud') {
              e.poisonTimer = Math.max(e.poisonTimer, 3.2);
              e.poisonDps = Math.max(e.poisonDps, z.damage * 0.65);
              e.slowTimer = Math.max(e.slowTimer, 0.8);
            }
          }
        }
      }

      if (z.life <= 0) {
        this.zones.splice(i, 1);
        if (z.kind === 'void_hole') {
          this.fx.spawnWorld('dark_explosion', z.x, z.y, {
            element: z.element === 'shadow' ? 'none' : z.element,
            priority: 4,
          });
          sound.playExplosion(false);
          this.addShake(2.8, 0.2);
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius * 1.2 + e.radius) {
              this.damageEnemy(e, z.damage * 2.4, z.element, z.x, z.y, 95);
            }
          }
        }
      }
    }
  }

  private updateBeams(dt: number): void {
    const p = this.player;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.tickTimer -= dt;

      // Gently track aimAngle for the primary beam
      const diff = Math.atan2(Math.sin(p.aimAngle - b.angle), Math.cos(p.aimAngle - b.angle));
      b.angle += diff * Math.min(1, dt * 3.5);

      if (b.tickTimer <= 0) {
        b.tickTimer = 0.14;
        const cos = Math.cos(b.angle);
        const sin = Math.sin(b.angle);
        for (const e of this.enemies) {
          if (e.dead) continue;
          const rx = e.x - p.x;
          const ry = e.y - p.y;
          const proj = rx * cos + ry * sin;
          if (proj < 0 || proj > b.length + e.radius) continue;
          const perp = Math.abs(-rx * sin + ry * cos);
          if (perp <= b.width + e.radius) {
            this.damageEnemy(e, b.damage, b.element, p.x, p.y, 24);
          }
        }
      }

      if (b.life <= 0) {
        this.beams.splice(i, 1);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;

      if (proj.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.fromEnemy) {
        const d = Math.hypot(proj.x - p.x, proj.y - p.y);
        if (d <= proj.radius + 7) {
          this.damagePlayer(proj.damage);
          this.fx.spawnWorld('hit_spark', proj.x, proj.y, { element: 'shadow', priority: 2 });
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      // Player projectile hits enemies
      let consumed = false;
      for (const e of this.enemies) {
        if (e.dead || proj.hitIds.has(e.id)) continue;
        const d = Math.hypot(proj.x - e.x, proj.y - e.y);
        if (d <= proj.radius + e.radius) {
          proj.hitIds.add(e.id);
          this.damageEnemy(e, proj.damage, proj.element, proj.x, proj.y, 65);

          if (proj.explodeRadius && proj.explodeRadius > 0) {
            this.fx.spawnWorld('small_explosion', proj.x, proj.y, {
              element: proj.element === 'fire' ? 'none' : proj.element,
              priority: 3,
            });
            sound.playExplosion(false);
            this.addShake(1.6, 0.1);
            for (const other of this.enemies) {
              if (other.dead || other.id === e.id) continue;
              if (Math.hypot(other.x - proj.x, other.y - proj.y) <= proj.explodeRadius + other.radius) {
                this.damageEnemy(other, proj.damage * 0.72, proj.element, proj.x, proj.y, 55);
              }
            }
          }

          if (proj.pierce > 0) {
            proj.pierce--;
          } else {
            consumed = true;
            break;
          }
        }
      }

      if (consumed) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number): void {
    const p = this.player;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }

      e.animTime += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      if (e.stunTimer > 0) e.stunTimer -= dt;

      // Burn & Poison DoT
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) {
          this.killEnemy(e);
          continue;
        }
      }
      if (e.poisonTimer > 0) {
        e.poisonTimer -= dt;
        e.hp -= e.poisonDps * dt;
        if (e.hp <= 0) {
          this.killEnemy(e);
          continue;
        }
      }

      // Knockback decay
      if (Math.hypot(e.knockVx, e.knockVy) > 2) {
        e.x += e.knockVx * dt;
        e.y += e.knockVy * dt;
        e.knockVx *= Math.pow(0.04, dt);
        e.knockVy *= Math.pow(0.04, dt);
      }

      if (e.stunTimer <= 0) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.facing = dx >= 0 ? 1 : -1;

        const speedMult = e.slowTimer > 0 ? 0.55 : 1;
        const moveSpeed = e.speed * speedMult;

        // Casters stop at mid-range and shoot plasma bolts
        if ((e.kind === 'caster' || e.isBoss) && dist < (e.isBoss ? 140 : 120)) {
          if (e.isBoss) {
            e.x += (dx / dist) * moveSpeed * 0.65 * dt;
            e.y += (dy / dist) * moveSpeed * 0.65 * dt;
          }
          e.attackTimer -= dt;
          if (e.attackTimer <= 0) {
            e.attackTimer = e.isBoss ? 2.2 : 2.8;
            const shots = e.isBoss ? 5 : 1;
            const baseA = Math.atan2(dy, dx);
            for (let s = 0; s < shots; s++) {
              const a = shots === 1 ? baseA : baseA + (s - 2) * 0.32;
              this.projectiles.push({
                id: this.nextEntityId++,
                fromEnemy: true,
                element: 'none',
                stampKey: 'enemy_plasma',
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * (e.isBoss ? 112 : 92),
                vy: Math.sin(a) * (e.isBoss ? 112 : 92),
                angle: a,
                radius: 5,
                damage: Math.round(e.damage * 0.85),
                pierce: 0,
                life: 2.6,
                maxLife: 2.6,
                scale: 0.45,
                hitIds: new Set(),
              });
            }
          }
        } else {
          e.x += (dx / dist) * moveSpeed * dt;
          e.y += (dy / dist) * moveSpeed * dt;
        }

        // Contact damage with player
        if (dist <= e.radius + 7) {
          this.damagePlayer(e.damage);
        }

        // Soft separation from neighbors (lightweight O(n) neighbor sample)
        const next = this.enemies[(i + 1) % this.enemies.length];
        if (next && next !== e) {
          const sx = e.x - next.x;
          const sy = e.y - next.y;
          const sd = Math.hypot(sx, sy);
          const minD = e.radius + next.radius - 2;
          if (sd > 0.1 && sd < minD) {
            const push = (minD - sd) * 0.35;
            e.x += (sx / sd) * push;
            e.y += (sy / sd) * push;
          }
        }

        // Respawn non-boss far-off enemies closer to keep action dense
        if (!e.isBoss && !e.isElite && dist > 420) {
          const a = Math.random() * Math.PI * 2;
          e.x = p.x + Math.cos(a) * 280;
          e.y = p.y + Math.sin(a) * 200;
        }
      }
    }
  }

  private damageEnemy(
    e: Enemy,
    rawDmg: number,
    element: ElementType,
    srcX: number,
    srcY: number,
    knockback: number
  ): void {
    if (e.dead) return;
    const p = this.player;

    let critChance = p.critChance + (e.slowTimer > 0 && element === 'frost' ? 0.15 : 0);
    const isCrit = Math.random() < critChance;
    let dmg = rawDmg * (isCrit ? p.critMult : 1);

    // Shadow execute bonus
    if (element === 'shadow' && e.hp / e.maxHp < 0.35) {
      dmg *= 1.3;
    }

    const finalDmg = Math.max(1, Math.round(dmg));
    e.hp -= finalDmg;
    e.hitFlash = 0.11;

    // Knockback
    if (knockback > 0 && !e.isBoss) {
      const dx = e.x - srcX;
      const dy = e.y - srcY;
      const d = Math.hypot(dx, dy) || 1;
      const resist = e.isElite ? 0.35 : 1;
      e.knockVx += (dx / d) * knockback * resist;
      e.knockVy += (dy / d) * knockback * resist;
    }

    // Elemental procs
    if (element === 'fire') {
      e.burnTimer = Math.max(e.burnTimer, 3.0);
      e.burnDps = Math.max(e.burnDps, rawDmg * 0.28 * p.burnMult);
    } else if (element === 'frost') {
      e.slowTimer = Math.max(e.slowTimer, 2.2 * p.freezeMult);
    } else if (element === 'lightning' && Math.random() < 0.34) {
      const jumpTarget = this.findNearestEnemy(e.x, e.y, 85, e.id);
      if (jumpTarget) {
        const arcDmg = Math.max(2, Math.round(rawDmg * 0.45));
        jumpTarget.hp -= arcDmg;
        jumpTarget.hitFlash = 0.1;
        this.chainArcs.push({
          x1: e.x,
          y1: e.y,
          x2: jumpTarget.x,
          y2: jumpTarget.y,
          life: 0.16,
          color: '#ffe866',
        });
        this.spawnText(jumpTarget.x, jumpTarget.y - 10, `${arcDmg}`, '#ffe866', false);
        if (jumpTarget.hp <= 0) this.killEnemy(jumpTarget);
      }
    }

    // Visual spark + floating number
    const txtColor = isCrit
      ? '#ffe047'
      : element !== 'none'
        ? ELEMENT_INFO[element].color
        : '#ffffff';
    this.spawnText(e.x + (Math.random() - 0.5) * 8, e.y - e.radius - 4, `${finalDmg}`, txtColor, isCrit);

    if (isCrit) {
      this.fx.spawnWorld('crit_hit', e.x, e.y, { element, priority: 2 });
      sound.playHit(true);
    } else if (Math.random() < 0.45) {
      this.fx.spawnWorld('hit_spark', e.x, e.y, { element, priority: 1 });
      sound.playHit(false);
    }

    if (e.hp <= 0) {
      if (element === 'shadow' && Math.random() < 0.12 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 2);
      }
      this.killEnemy(e);
    }
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this.metaSave.totalKills++;

    if (e.isBoss) {
      this.addDust(50);
      this.flushRunDustToSave();
      this.fx.spawnWorld('big_explosion', e.x, e.y, { priority: 5 });
      this.addShake(6, 0.55);
      this.hitStopTimer = 0.06;
      sound.playExplosion(true);

      // Boss drops chest + big XP
      this.gems.push({
        id: this.nextEntityId++,
        kind: 'chest',
        x: e.x,
        y: e.y,
        value: 1,
        magnetized: false,
        magnetSpeed: 0,
        bobPhase: 0,
      });

      if (e.kind === 'boss_void' && !this.endless) {
        this.phase = 'victory';
        sound.playObjectiveComplete();
        this.pushHud();
        return;
      } else {
        this.showBanner(`🎉 击败首领 ${e.name ?? ''}！获得大量星尘并掉落金色宝箱`, 3.5);
      }
    } else {
      this.addDust(e.isElite ? 10 : 1);
      if (Math.random() < 0.35 || e.isElite) {
        this.fx.spawnWorld('poof', e.x, e.y, { priority: 1 });
      }
      if (e.isElite) {
        this.flushRunDustToSave();
        if (Math.random() < 0.22) {
          this.gems.push({
            id: this.nextEntityId++,
            kind: 'chest',
            x: e.x,
            y: e.y,
            value: 1,
            magnetized: false,
            magnetSpeed: 0,
            bobPhase: 0,
          });
        }
      }
    }

    // XP gem drop
    const xpKind = e.xpValue >= 25 ? 'xp_large' : e.xpValue >= 12 ? 'xp_med' : 'xp_small';
    this.gems.push({
      id: this.nextEntityId++,
      kind: xpKind,
      x: e.x + (Math.random() - 0.5) * 6,
      y: e.y + (Math.random() - 0.5) * 6,
      value: e.xpValue,
      magnetized: false,
      magnetSpeed: 0,
      bobPhase: Math.random() * 6,
    });

    // Occasional heal or magnet pickup
    const r = Math.random();
    if (r < 0.022) {
      this.gems.push({
        id: this.nextEntityId++,
        kind: 'heal',
        x: e.x,
        y: e.y,
        value: 18,
        magnetized: false,
        magnetSpeed: 0,
        bobPhase: Math.random() * 6,
      });
    } else if (r < 0.03) {
      this.gems.push({
        id: this.nextEntityId++,
        kind: 'magnet',
        x: e.x,
        y: e.y,
        value: 1,
        magnetized: false,
        magnetSpeed: 0,
        bobPhase: Math.random() * 6,
      });
    }
  }

  private damagePlayer(amount: number): void {
    const p = this.player;
    if (p.invulnTimer > 0) return;

    p.hp = Math.max(0, p.hp - amount);
    p.invulnTimer = 0.65;
    this.addShake(3.5, 0.22);
    sound.playPlayerHurt();
    this.spawnText(p.x, p.y - 16, `-${amount}`, '#ff4757', true);

    if (p.hp <= 0) {
      this.flushRunDustToSave();
      this.phase = 'gameover';
      this.fx.spawnWorld('big_explosion', p.x, p.y, { priority: 5 });
      this.pushHud();
    }
  }

  private updateGems(dt: number): void {
    const p = this.player;

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const dist = Math.hypot(dx, dy);

      if (g.kind !== 'chest' && !g.magnetized && dist <= p.pickupRadius) {
        g.magnetized = true;
        g.magnetSpeed = 165;
        this.pickupPulseTimer = 0.22;
      }

      if (g.magnetized) {
        g.magnetSpeed = Math.min(380, (g.magnetSpeed || 180) + 520 * dt);
        if (dist > 1) {
          g.x += (dx / dist) * g.magnetSpeed * dt;
          g.y += (dy / dist) * g.magnetSpeed * dt;
        }
      }

      if (dist <= (g.kind === 'chest' ? 16 : 12)) {
        this.gems.splice(i, 1);
        if (g.kind === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + g.value);
          this.spawnText(p.x, p.y - 14, `+${g.value} HP`, '#69ff94', false);
          sound.playGem();
        } else if (g.kind === 'magnet') {
          for (const other of this.gems) {
            if (other.kind.startsWith('xp')) {
              other.magnetized = true;
              other.magnetSpeed = 240;
            }
          }
          this.showBanner('🧲 磁力爆发！吸取全场经验水晶', 1.8);
          sound.playObjectiveComplete();
        } else if (g.kind === 'chest') {
          sound.playLevelUp();
          this.openUpgradeModal('🏆 秘宝宝箱 · 选择一项强力赐福');
          return;
        } else {
          sound.playGem();
          p.xp += g.value * p.xpMult;
          if (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = Math.round(p.xpToNext * 1.28 + 20 + p.level * p.level * 1.6);
            sound.playLevelUp();
            this.fx.spawnWorld('mana_burst', p.x, p.y, { priority: 4 });
            this.openUpgradeModal(`✨ 升至 Lv.${p.level} · 选择法术或强化`);
            return;
          }
        }
      }
    }
  }

  private openUpgradeModal(title: string): void {
    this.phase = 'levelup';
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.currentUpgradeTitle = title;
    this.currentRerollsLeft = this.player.rerollsPerLevelUp;
    const choices = this.generateUpgradeChoices();
    this.pushHud();
    this.onLevelUpChoices(choices, title, this.currentRerollsLeft);
  }

  public rerollUpgrades(): void {
    if (this.phase !== 'levelup' || this.currentRerollsLeft <= 0) return;
    this.currentRerollsLeft--;
    sound.playCast(640);
    const choices = this.generateUpgradeChoices();
    this.onLevelUpChoices(choices, this.currentUpgradeTitle, this.currentRerollsLeft);
  }

  public selectUpgrade(choice: UpgradeChoice): void {
    if (this.phase !== 'levelup') return;
    choice.apply();
    this.phase = 'playing';
    this.lastTime = performance.now();
    this.pushHud();
  }

  private generateUpgradeChoices(): UpgradeChoice[] {
    const p = this.player;
    const pool: UpgradeChoice[] = [];

    // 1. New spells (if < 6)
    if (p.spells.length < 6) {
      const ownedIds = new Set(p.spells.map((s) => s.id));
      for (const def of SPELLS) {
        if (ownedIds.has(def.id)) continue;
        pool.push({
          id: `new_${def.id}`,
          kind: 'new_spell',
          title: def.name,
          subtitle: `新法术 · ${def.tag}`,
          desc: def.desc,
          icon: def.icon,
          rarity: 'rare',
          badge: '新法术',
          accentColor: def.baseColor,
          apply: () => {
            p.spells.push({
              id: def.id,
              level: 1,
              element: def.defaultElement,
              cooldownTimer: 0.25,
              damageBonus: 0,
              cooldownBonus: 0,
              areaBonus: 0,
              extraCount: 0,
              extraPierce: 0,
            });
          },
        });
      }
    }

    // 2. Upgrade existing spells
    for (const s of p.spells) {
      const def = SPELL_MAP[s.id];
      if (s.level >= def.maxLevel) continue;

      const variants: {
        sub: string;
        desc: string;
        rarity: UpgradeChoice['rarity'];
        apply: () => void;
      }[] = [
        {
          sub: `${def.name} Lv.${s.level + 1}`,
          desc: `伤害 +28%，范围 +12%，经验效率 +6%`,
          rarity: 'common',
          apply: () => {
            s.level++;
            s.damageBonus += 0.28;
            s.areaBonus += 0.12;
            p.xpMult += 0.06;
          },
        },
        {
          sub: `${def.name} Lv.${s.level + 1}`,
          desc:
            s.id === 'frost_nova'
              ? `冷却 -14%，范围 +22%`
              : s.id === 'arcane_orbit'
                ? `环绕法球 +1，伤害 +15%`
                : s.id === 'chain_lightning'
                  ? `弹射次数 +2，伤害 +15%`
                  : `投射/落点数量 +1，冷却 -8%`,
          rarity: 'epic',
          apply: () => {
            s.level++;
            if (s.id === 'frost_nova') {
              s.cooldownBonus += 0.14;
              s.areaBonus += 0.22;
            } else if (s.id === 'chain_lightning') {
              s.extraCount += 2;
              s.damageBonus += 0.15;
            } else {
              s.extraCount += 1;
              s.cooldownBonus += 0.08;
              if (s.id === 'arcane_orbit') s.damageBonus += 0.15;
            }
          },
        },
      ];

      const pick = variants[Math.random() < 0.45 ? 1 : 0];
      pool.push({
        id: `upg_${s.id}_${s.level}`,
        kind: 'upgrade_spell',
        title: `${def.name} 强化`,
        subtitle: pick.sub,
        desc: pick.desc,
        icon: def.icon,
        rarity: pick.rarity,
        badge: `Lv.${s.level} → ${s.level + 1}`,
        accentColor: def.baseColor,
        apply: pick.apply,
      });

      // 3. Elemental Infusion (recolors pixelfx palette + adds element mechanics!)
      const elements: Exclude<ElementType, 'none'>[] = ['fire', 'frost', 'lightning', 'shadow'];
      const availableEls = elements.filter((el) => el !== s.element);
      const chosenEl = availableEls[Math.floor(Math.random() * availableEls.length)];
      if (chosenEl && Math.random() < 0.55) {
        const info = ELEMENT_INFO[chosenEl];
        pool.push({
          id: `infuse_${s.id}_${chosenEl}`,
          kind: 'infuse_element',
          title: `${def.name} · ${info.name}`,
          subtitle: `元素注入 · 特效实时换色`,
          desc: `${info.desc} 同时该法术伤害 +20%。`,
          icon: chosenEl === 'fire' ? '🔥' : chosenEl === 'frost' ? '❄️' : chosenEl === 'lightning' ? '⚡' : '🌑',
          rarity: 'legendary',
          badge: info.short,
          accentColor: info.color,
          apply: () => {
            s.element = chosenEl;
            s.damageBonus += 0.2;
          },
        });
      }
    }

    // 4. Relics (passives)
    const relics: UpgradeChoice[] = [
      {
        id: 'relic_power',
        kind: 'relic',
        title: '魔导秘典',
        subtitle: '全局遗物',
        desc: '所有法术伤害 +18%',
        icon: '📖',
        rarity: 'rare',
        badge: '遗物',
        accentColor: '#ff7a45',
        apply: () => {
          p.damageMult += 0.18;
          p.relics.power = (p.relics.power ?? 0) + 1;
        },
      },
      {
        id: 'relic_haste',
        kind: 'relic',
        title: '时之沙漏',
        subtitle: '全局遗物',
        desc: '所有法术冷却缩减 +10%，闪现冷却 -12%',
        icon: '⏳',
        rarity: 'epic',
        badge: '遗物',
        accentColor: '#5cd6ff',
        apply: () => {
          p.cooldownMult = Math.max(0.42, p.cooldownMult * 0.9);
          p.dashMaxCooldown = Math.max(1.1, p.dashMaxCooldown * 0.88);
          p.relics.haste = (p.relics.haste ?? 0) + 1;
        },
      },
      {
        id: 'relic_vitality',
        kind: 'relic',
        title: '生命护符',
        subtitle: '全局遗物',
        desc: '最大生命 +25 并立即回复 35 点生命值',
        icon: '❤️',
        rarity: 'common',
        badge: '遗物',
        accentColor: '#ff4d6d',
        apply: () => {
          p.maxHp += 25;
          p.hp = Math.min(p.maxHp, p.hp + 35);
          p.relics.vitality = (p.relics.vitality ?? 0) + 1;
        },
      },
      {
        id: 'relic_boots',
        kind: 'relic',
        title: '疾风魔靴',
        subtitle: '全局遗物',
        desc: '移动速度 +14%，拾取范围 +25%',
        icon: '👢',
        rarity: 'common',
        badge: '遗物',
        accentColor: '#69ff94',
        apply: () => {
          p.speed = Math.round(p.speed * 1.14);
          p.pickupRadius = Math.round(p.pickupRadius * 1.25);
          p.relics.boots = (p.relics.boots ?? 0) + 1;
        },
      },
      {
        id: 'relic_crit',
        kind: 'relic',
        title: '星辰透镜',
        subtitle: '全局遗物',
        desc: '暴击率 +10%，暴击伤害 +25%',
        icon: '💎',
        rarity: 'rare',
        badge: '遗物',
        accentColor: '#ffe047',
        apply: () => {
          p.critChance = Math.min(0.85, p.critChance + 0.1);
          p.critMult += 0.25;
          p.relics.crit = (p.relics.crit ?? 0) + 1;
        },
      },
      {
        id: 'relic_scholar',
        kind: 'relic',
        title: '学者圣典',
        subtitle: '全局遗物 · 成长',
        desc: '经验获取效率 +25%，升级速度大幅加快',
        icon: '📚',
        rarity: 'rare',
        badge: '经验效率',
        accentColor: '#4df0a7',
        apply: () => {
          p.xpMult += 0.25;
          p.relics.scholar = (p.relics.scholar ?? 0) + 1;
        },
      },
      {
        id: 'relic_magnet',
        kind: 'relic',
        title: '星界磁石',
        subtitle: '全局遗物 · 拾取',
        desc: '自动拾取范围 +40%，经验获取效率 +10%',
        icon: '🧲',
        rarity: 'rare',
        badge: '自动拾取',
        accentColor: '#5cd6ff',
        apply: () => {
          p.pickupRadius = Math.round(p.pickupRadius * 1.4);
          p.xpMult += 0.1;
          p.relics.magnet = (p.relics.magnet ?? 0) + 1;
        },
      },
      {
        id: 'relic_dice',
        kind: 'relic',
        title: '命运骰子',
        subtitle: '全局遗物 · 刷新',
        desc: '每次升级额外获得 +1 次刷新机会，暴击率 +6%',
        icon: '🎲',
        rarity: 'epic',
        badge: '刷新+1',
        accentColor: '#ffd147',
        apply: () => {
          p.rerollsPerLevelUp += 1;
          p.critChance = Math.min(0.85, p.critChance + 0.06);
          p.relics.dice = (p.relics.dice ?? 0) + 1;
        },
      },
    ];

    pool.push(...relics);

    // Shuffle and pick 3 distinct choices
    pool.sort(() => Math.random() - 0.5);
    return pool.slice(0, 3);
  }

  private findNearestEnemy(x: number, y: number, maxDist: number, excludeId?: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.id === excludeId) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private spawnText(x: number, y: number, text: string, color: string, crit: boolean): void {
    if (this.texts.length > 48) this.texts.shift();
    this.texts.push({
      x,
      y,
      vy: crit ? -26 : -18,
      text,
      color,
      crit,
      life: 0.65,
      maxLife: 0.65,
    });
  }

  private updateTextsAndArcs(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.chainArcs.length - 1; i >= 0; i--) {
      this.chainArcs[i].life -= dt;
      if (this.chainArcs[i].life <= 0) this.chainArcs.splice(i, 1);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const shakeX = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeAmp * 2 : 0;
    const shakeY = this.shakeTimer > 0 ? (Math.random() - 0.5) * this.shakeAmp * 2 : 0;
    const cx = this.camX + shakeX;
    const cy = this.camY + shakeY;

    // 1. Pixel-art tiled ground
    drawArenaGround(ctx, cx, cy, VIEW_W, VIEW_H, this.elapsed);

    // 2. Prepare world-space pixelfx back & front layers
    this.fx.prepareWorldLayers(cx, cy);
    this.fx.drawBackLayer(ctx);

    // 3. Ground zones (Void Black Holes, Poison Clouds, Fire Tornadoes) & Objective floor markers
    for (const z of this.zones) {
      const sx = z.x - cx;
      const sy = z.y - cy;
      if (sx < -120 || sx > VIEW_W + 120 || sy < -120 || sy > VIEW_H + 120) continue;
      if (z.kind === 'void_hole') {
        this.fx.drawStamp(ctx, 'black_hole', z.element === 'shadow' ? 'none' : z.element, sx, sy, 0, z.scale);
      } else if (z.kind === 'poison_cloud') {
        this.fx.drawStamp(ctx, 'poison_cloud', z.element, sx, sy, 0, z.scale);
      } else if (z.kind === 'fire_tornado') {
        this.fx.drawStamp(ctx, 'fire_tornado', z.element === 'fire' ? 'none' : z.element, sx, sy + 10, 0, z.scale);
      }
    }

    // Subtle auto-pickup magnet aura around wizard
    const psx = this.player.x - cx;
    const psy = this.player.y - cy;
    ctx.strokeStyle =
      this.pickupPulseTimer > 0
        ? `rgba(77, 240, 167, ${(0.12 + this.pickupPulseTimer * 0.8).toFixed(2)})`
        : 'rgba(126, 104, 214, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(psx, psy, this.player.pickupRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (this.objective && this.objective.active) {
      this.renderObjective(ctx, this.objective, cx, cy);
    }

    // Telegraph rings for incoming Meteors / Lightning / Smite
    for (const s of this.delayedStrikes) {
      const sx = s.x - cx;
      const sy = s.y - cy;
      const color =
        s.kind === 'meteor' ? 'rgba(255, 100, 40, 0.55)' : s.kind === 'lightning' ? 'rgba(255, 232, 82, 0.5)' : 'rgba(255, 224, 120, 0.5)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, s.radius * 0.75, s.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Gems & Pickups
    for (const g of this.gems) {
      const sx = g.x - cx;
      const sy = g.y - cy;
      if (sx < -20 || sx > VIEW_W + 20 || sy < -20 || sy > VIEW_H + 20) continue;
      drawGem(ctx, g, sx, sy, this.elapsed);
    }

    // 5. Entities sorted by Y (enemies + wizard)
    const drawList: { y: number; draw: () => void }[] = [];
    const wiz = WIZARD_MAP[this.player.wizardId];

    drawList.push({
      y: this.player.y,
      draw: () => drawWizard(ctx, this.player, wiz, this.player.x - cx, this.player.y - cy, this.elapsed),
    });

    for (const e of this.enemies) {
      if (e.dead) continue;
      const sx = e.x - cx;
      const sy = e.y - cy;
      if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;
      drawList.push({
        y: e.y,
        draw: () => drawEnemy(ctx, e, sx, sy, this.elapsed),
      });
    }

    drawList.sort((a, b) => a.y - b.y);
    for (const item of drawList) item.draw();

    // 6. Arcane Orbit stamps
    const orbitSpell = this.player.spells.find((s) => s.id === 'arcane_orbit');
    if (orbitSpell) {
      const { area, count } = this.getSpellStats(orbitSpell);
      for (let i = 0; i < count; i++) {
        const a = this.orbitAngle + (i / count) * Math.PI * 2;
        const sx = this.player.x + Math.cos(a) * area - cx;
        const sy = this.player.y + Math.sin(a) * area - cy;
        this.fx.drawStamp(ctx, 'arcane_orb', orbitSpell.element, sx, sy, 0, 0.34);
      }
    }

    // 7. Projectiles using cached looping pixelfx stamps!
    for (const proj of this.projectiles) {
      const sx = proj.x - cx;
      const sy = proj.y - cy;
      if (sx < -90 || sx > VIEW_W + 90 || sy < -90 || sy > VIEW_H + 90) continue;

      if (proj.fromEnemy) {
        this.fx.drawStamp(ctx, 'enemy_plasma', 'none', sx, sy, proj.angle, proj.scale);
      } else if (proj.stampKey === 'fireball') {
        const el = proj.element === 'fire' ? 'none' : proj.element;
        this.fx.drawStamp(ctx, 'fireball', el, sx, sy, proj.angle, proj.scale);
      } else if (proj.stampKey === 'ice_lance') {
        const el = proj.element === 'frost' ? 'none' : proj.element;
        this.fx.drawStamp(ctx, 'ice_lance', el, sx, sy, proj.angle, proj.scale);
      }
    }

    // 7.5 Continuous Arcane Beams
    for (const b of this.beams) {
      const sx = this.player.x - cx;
      const sy = this.player.y - 4 - cy;
      const scaleX = Math.max(0.6, b.length / 168);
      this.fx.drawStamp(ctx, 'arcane_beam', b.element, sx, sy, b.angle, scaleX);
    }

    // 8. Lightning chain arcs
    for (const arc of this.chainArcs) {
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const sx1 = arc.x1 - cx;
      const sy1 = arc.y1 - cy;
      const sx2 = arc.x2 - cx;
      const sy2 = arc.y2 - cy;
      const mx = (sx1 + sx2) / 2 + (Math.random() - 0.5) * 12;
      const my = (sy1 + sy2) / 2 + (Math.random() - 0.5) * 12;
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(mx, my);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    // 9. World-space pixelfx front layer (Frost Nova, Lightning Strikes, Meteors, Smite, Explosions, Sparks)
    this.fx.drawFrontLayer(ctx);

    // 10. Floating damage numbers
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const sx = Math.round(t.x - cx);
      const sy = Math.round(t.y - cy);
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.font = t.crit ? 'bold 10px monospace' : 'bold 8px monospace';
      ctx.fillStyle = '#09080f';
      ctx.fillText(t.text, sx + 1, sy + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    // 11. Manual aim crosshair
    if (this.manualAim && this.phase === 'playing') {
      const mx = Math.round(this.mouseScreenX);
      const my = Math.round(this.mouseScreenY);
      ctx.strokeStyle = 'rgba(255, 232, 102, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe866';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
  }

  private renderObjective(
    ctx: CanvasRenderingContext2D,
    obj: Objective,
    cx: number,
    cy: number
  ): void {
    const sx = obj.x - cx;
    const sy = obj.y - cy;

    if (obj.kind === 'rune_circle') {
      this.fx.drawStamp(ctx, 'rune_circle', 'none', sx, sy, 0, 0.85);
      // Progress ring
      ctx.strokeStyle = '#69ff94';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, obj.radius, -Math.PI / 2, -Math.PI / 2 + obj.progress * Math.PI * 2);
      ctx.stroke();
    } else if (obj.kind === 'void_rift') {
      this.fx.drawStamp(ctx, 'spawn_portal', 'shadow', sx, sy, 0, 0.6);
    } else if (obj.kind === 'star_shards' && obj.shards) {
      for (const s of obj.shards) {
        if (s.collected) continue;
        const shX = Math.round(s.x - cx);
        const shY = Math.round(s.y - cy + Math.sin(this.elapsed * 6) * 2);
        ctx.fillStyle = '#ffe866';
        ctx.fillRect(shX - 3, shY - 3, 6, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(shX - 1, shY - 5, 2, 10);
        ctx.fillRect(shX - 5, shY - 1, 10, 2);
      }
    }

    // Off-screen directional indicator arrow
    if (sx < 14 || sx > VIEW_W - 14 || sy < 14 || sy > VIEW_H - 14) {
      const a = Math.atan2(sy - VIEW_H / 2, sx - VIEW_W / 2);
      const ax = Math.max(18, Math.min(VIEW_W - 18, VIEW_W / 2 + Math.cos(a) * (VIEW_W / 2 - 22)));
      const ay = Math.max(22, Math.min(VIEW_H - 22, VIEW_H / 2 + Math.sin(a) * (VIEW_H / 2 - 24)));

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd147';
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  public pushHud(): void {
    const p = this.player;
    const boss = this.enemies.find((e) => e.isBoss && !e.dead);

    this.onHudUpdate({
      phase: this.phase,
      hp: Math.ceil(p.hp),
      maxHp: Math.ceil(p.maxHp),
      xp: p.xp,
      xpToNext: p.xpToNext,
      level: p.level,
      elapsed: this.elapsed,
      kills: this.kills,
      runDust: this.runDust,
      totalDust: this.metaSave.dust + (this.runDust - this.runSavedDust),
      wave: this.getWaveNumber(),
      dashReadyRatio: p.dashCooldown <= 0 ? 1 : 1 - p.dashCooldown / p.dashMaxCooldown,
      manualAim: this.manualAim,
      muted: sound.isMuted(),
      spells: p.spells,
      boss: boss ? { name: boss.name ?? '首领', hp: Math.max(0, Math.ceil(boss.hp)), maxHp: boss.maxHp } : null,
      objective:
        this.objective && this.objective.active
          ? { title: this.objective.title, desc: this.objective.desc, progress: this.objective.progress }
          : null,
      banner: this.bannerText,
      endless: this.endless,
      wizardName: WIZARD_MAP[p.wizardId].name,
      stats: {
        damagePct: Math.round(p.damageMult * 100),
        cooldownPct: Math.round((1 - p.cooldownMult) * 100),
        areaPct: Math.round(p.areaMult * 100),
        critPct: Math.round(p.critChance * 100),
        speed: Math.round(p.speed),
        xpPct: Math.round(p.xpMult * 100),
        pickupRadius: Math.round(p.pickupRadius),
        rerollsPerLevelUp: p.rerollsPerLevelUp,
      },
    });
  }
}
