import {
  createFrame,
  clearFrame,
  createFx,
  composite,
  type FxInstance,
  type FxModule,
  type FxOptions,
  type PixelFrame,
} from 'pixelfx';

import * as fxFireball from 'pixelfx/fx/fire/fireball';
import * as fxIceLance from 'pixelfx/fx/ice/ice-lance';
import * as fxFrostNova from 'pixelfx/fx/ice/frost-nova';
import * as fxLightningStrike from 'pixelfx/fx/lightning/lightning-strike';
import * as fxZapHit from 'pixelfx/fx/lightning/zap-hit';
import * as fxArcaneOrb from 'pixelfx/fx/arcane/arcane-orb';
import * as fxManaBurst from 'pixelfx/fx/arcane/mana-burst';
import * as fxRuneCircle from 'pixelfx/fx/arcane/rune-circle';
import * as fxBlinkOut from 'pixelfx/fx/arcane/blink-out';
import * as fxBlinkIn from 'pixelfx/fx/arcane/blink-in';
import * as fxMeteor from 'pixelfx/fx/fire/meteor';
import * as fxBlackHole from 'pixelfx/fx/shadow/black-hole';
import * as fxDarkExplosion from 'pixelfx/fx/shadow/dark-explosion';
import * as fxSmite from 'pixelfx/fx/holy/smite';
import * as fxHealAoe from 'pixelfx/fx/holy/heal-aoe';
import * as fxSmallExplosion from 'pixelfx/fx/explosions/small-explosion';
import * as fxBigExplosion from 'pixelfx/fx/explosions/big-explosion';
import * as fxHitSpark from 'pixelfx/fx/impacts/hit-spark';
import * as fxCritHit from 'pixelfx/fx/impacts/crit-hit';
import * as fxPoof from 'pixelfx/fx/spawn/poof';
import * as fxSpawnPortal from 'pixelfx/fx/spawn/spawn-portal';
import * as fxPlasmaShot from 'pixelfx/fx/projectiles/plasma-shot';
import * as fxFireTornado from 'pixelfx/fx/fire/fire-tornado';
import * as fxChainLightning from 'pixelfx/fx/lightning/chain-lightning';
import * as fxPoisonCloud from 'pixelfx/fx/nature/poison-cloud';
import * as fxArcaneBeam from 'pixelfx/fx/arcane/arcane-beam';
import * as fxFlamePillar from 'pixelfx/fx/fire/flame-pillar';
import * as fxThunderclap from 'pixelfx/fx/lightning/thunderclap';
import * as fxStarFall from 'pixelfx/fx/arcane/star-fall';
import * as fxTimeStop from 'pixelfx/fx/arcane/time-stop';
import * as fxHealingBloom from 'pixelfx/fx/nature/healing-bloom';
import * as fxBarrelExplosion from 'pixelfx/fx/explosions/barrel-explosion';

import type { ElementType } from '../types';
import { ELEMENT_INFO } from '../data/spells';

export type WorldFxKind =
  | 'frost_nova'
  | 'lightning_strike'
  | 'chain_lightning'
  | 'zap_hit'
  | 'mana_burst'
  | 'blink_out'
  | 'blink_in'
  | 'meteor'
  | 'dark_explosion'
  | 'smite'
  | 'heal_aoe'
  | 'small_explosion'
  | 'big_explosion'
  | 'hit_spark'
  | 'crit_hit'
  | 'poof'
  | 'flame_pillar'
  | 'thunderclap'
  | 'star_fall'
  | 'time_stop'
  | 'healing_bloom'
  | 'barrel_explosion';

export type StampFxBase =
  | 'fireball'
  | 'ice_lance'
  | 'arcane_orb'
  | 'black_hole'
  | 'fire_tornado'
  | 'poison_cloud'
  | 'arcane_beam'
  | 'rune_circle'
  | 'spawn_portal'
  | 'enemy_plasma';

const WORLD_MODS: Record<WorldFxKind, FxModule> = {
  frost_nova: fxFrostNova,
  lightning_strike: fxLightningStrike,
  chain_lightning: fxChainLightning,
  zap_hit: fxZapHit,
  mana_burst: fxManaBurst,
  blink_out: fxBlinkOut,
  blink_in: fxBlinkIn,
  meteor: fxMeteor,
  dark_explosion: fxDarkExplosion,
  smite: fxSmite,
  heal_aoe: fxHealAoe,
  small_explosion: fxSmallExplosion,
  big_explosion: fxBigExplosion,
  hit_spark: fxHitSpark,
  crit_hit: fxCritHit,
  poof: fxPoof,
  flame_pillar: fxFlamePillar,
  thunderclap: fxThunderclap,
  star_fall: fxStarFall,
  time_stop: fxTimeStop,
  healing_bloom: fxHealingBloom,
  barrel_explosion: fxBarrelExplosion,
};

const STAMP_MODS: Record<StampFxBase, FxModule> = {
  fireball: fxFireball,
  ice_lance: fxIceLance,
  arcane_orb: fxArcaneOrb,
  black_hole: fxBlackHole,
  fire_tornado: fxFireTornado,
  poison_cloud: fxPoisonCloud,
  arcane_beam: fxArcaneBeam,
  rune_circle: fxRuneCircle,
  spawn_portal: fxSpawnPortal,
  enemy_plasma: fxPlasmaShot,
};

interface StampEntry {
  key: string;
  base: StampFxBase;
  fx: FxInstance;
  frame: PixelFrame;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imgData: ImageData;
  ox: number;
  oy: number;
  usedThisFrame: boolean;
}

interface LiveWorldFx {
  instance: FxInstance;
  priority: number; // higher = kept over minor sparks when pool is full
  layer: 'both' | 'back' | 'front';
}

export class PixelFxManager {
  private readonly width: number;
  private readonly height: number;

  private readonly backFrame: PixelFrame;
  private readonly backCanvas: HTMLCanvasElement;
  private readonly backCtx: CanvasRenderingContext2D;
  private readonly backImg: ImageData;

  private readonly frontFrame: PixelFrame;
  private readonly frontCanvas: HTMLCanvasElement;
  private readonly frontCtx: CanvasRenderingContext2D;
  private readonly frontImg: ImageData;

  private stamps = new Map<string, StampEntry>();
  private worldFx: LiveWorldFx[] = [];
  private readonly maxWorldFx: number;
  private seedCounter = 1;
  private fxAccum = 0;
  private readonly fxStep = 1 / 30; // Native pixelfx 30 FPS cadence
  private worldLayerDirty = true;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const isMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 820);
    this.maxWorldFx = isMobile ? 16 : 26;

    this.backFrame = createFrame(width, height);
    this.backCanvas = document.createElement('canvas');
    this.backCanvas.width = width;
    this.backCanvas.height = height;
    this.backCtx = this.backCanvas.getContext('2d')!;
    this.backImg = this.backCtx.createImageData(width, height);

    this.frontFrame = createFrame(width, height);
    this.frontCanvas = document.createElement('canvas');
    this.frontCanvas.width = width;
    this.frontCanvas.height = height;
    this.frontCtx = this.frontCanvas.getContext('2d')!;
    this.frontImg = this.frontCtx.createImageData(width, height);
  }

  public clearAll(): void {
    this.worldFx = [];
    this.worldLayerDirty = true;
  }

  public getStampKey(base: StampFxBase, element: ElementType): string {
    return `${base}:${element}`;
  }

  private ensureStamp(base: StampFxBase, element: ElementType): StampEntry {
    const key = this.getStampKey(base, element);
    let entry = this.stamps.get(key);
    if (entry) return entry;

    const mod = STAMP_MODS[base];
    const size = mod.meta?.size ?? [128, 128];
    const origin = mod.meta?.origin ?? [Math.floor(size[0] / 2), Math.floor(size[1] / 2)];
    const w = size[0];
    const h = size[1];

    const opts: FxOptions = {
      x: origin[0],
      y: origin[1],
      seed: 7,
    };

    if (element !== 'none') {
      opts.palette = ELEMENT_INFO[element].palette;
    } else if (base === 'enemy_plasma') {
      opts.palette = ['#24071f', '#6b124d', '#c7246b', '#ff578f', '#ffb3cc', '#ffffff'];
    }

    const frame = createFrame(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(w, h);

    const fx = createFx(mod, opts);
    // Warm up a tiny bit so looping effects start mid-flame instead of empty
    fx.update(0.25);

    const pivotX = base === 'arcane_beam' ? origin[0] + 15 : origin[0];
    const pivotY = base === 'arcane_beam' ? origin[1] - 24 : origin[1];

    entry = {
      key,
      base,
      fx,
      frame,
      canvas,
      ctx,
      imgData,
      ox: pivotX,
      oy: pivotY,
      usedThisFrame: true,
    };
    this.stamps.set(key, entry);
    return entry;
  }

  /**
   * Spawn a live one-shot pixelfx directly in world coordinates.
   */
  public spawnWorld(
    kind: WorldFxKind,
    x: number,
    y: number,
    opts?: {
      element?: ElementType;
      angle?: number;
      flip?: boolean;
      priority?: number;
      light?: number;
      layer?: 'both' | 'back' | 'front';
    }
  ): void {
    const priority = opts?.priority ?? (kind === 'hit_spark' || kind === 'poof' ? 1 : 3);

    if (this.worldFx.length >= this.maxWorldFx) {
      // Drop low-priority spark if pool is saturated
      if (priority <= 1) return;
      // Otherwise evict oldest low-priority effect
      const evictIdx = this.worldFx.findIndex((item) => item.priority <= 1);
      if (evictIdx >= 0) {
        this.worldFx.splice(evictIdx, 1);
      } else {
        this.worldFx.shift();
      }
    }

    const mod = WORLD_MODS[kind];
    const fxOpts: FxOptions = {
      x: Math.round(x),
      y: Math.round(y),
      angle: opts?.angle ?? 0,
      flip: opts?.flip ?? false,
      seed: (this.seedCounter++ % 97) + 1,
      light: opts?.light ?? 1,
    };

    if (opts?.element && opts.element !== 'none') {
      fxOpts.palette = ELEMENT_INFO[opts.element].palette;
    }

    const instance = createFx(mod, fxOpts);
    this.worldFx.push({
      instance,
      priority,
      layer: opts?.layer ?? 'both',
    });
  }

  public update(dt: number): void {
    // Throttle procedural pixelfx stepping & pixel compositing to native 30 FPS
    this.fxAccum += dt;
    if (this.fxAccum < this.fxStep) return;
    const stepDt = Math.min(0.08, this.fxAccum);
    this.fxAccum = 0;
    this.worldLayerDirty = true;

    // Update active world one-shots
    for (let i = this.worldFx.length - 1; i >= 0; i--) {
      const item = this.worldFx[i];
      item.instance.update(stepDt);
      if (item.instance.done()) {
        this.worldFx.splice(i, 1);
      }
    }

    // Update & render only stamps that were used recently
    for (const stamp of this.stamps.values()) {
      if (!stamp.usedThisFrame) continue;
      stamp.fx.update(stepDt);
      clearFrame(stamp.frame);
      stamp.fx.draw(stamp.frame);
      composite(stamp.frame, stamp.imgData.data, null, 1.0);
      stamp.ctx.putImageData(stamp.imgData, 0, 0);
      stamp.usedThisFrame = false;
    }
  }

  /**
   * Draw a cached looping pixelfx stamp at screen-space position (sx, sy) with rotation & scale.
   */
  public drawStamp(
    ctx: CanvasRenderingContext2D,
    base: StampFxBase,
    element: ElementType,
    sx: number,
    sy: number,
    angle = 0,
    scale = 1
  ): void {
    const stamp = this.ensureStamp(base, element);
    stamp.usedThisFrame = true;

    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    if (angle !== 0) ctx.rotate(angle);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(stamp.canvas, -stamp.ox, -stamp.oy);
    ctx.restore();
  }

  /**
   * Render world-space pixelfx into back & front layers for the current camera top-left (camX, camY).
   */
  public prepareWorldLayers(camX: number, camY: number): void {
    if (!this.worldLayerDirty && this.worldFx.length === 0) return;
    this.worldLayerDirty = false;
    const ox = Math.round(camX);
    const oy = Math.round(camY);

    this.backFrame.ox = ox;
    this.backFrame.oy = oy;
    this.frontFrame.ox = ox;
    this.frontFrame.oy = oy;

    clearFrame(this.backFrame);
    clearFrame(this.frontFrame);

    let hasBack = false;
    let hasFront = false;

    for (const item of this.worldFx) {
      // Quick frustum cull (generous margin for big explosions/meteors)
      const fxX = item.instance.options.x ?? 0;
      const fxY = item.instance.options.y ?? 0;
      if (
        fxX < ox - 200 ||
        fxX > ox + this.width + 200 ||
        fxY < oy - 220 ||
        fxY > oy + this.height + 220
      ) {
        continue;
      }

      if (item.layer === 'back' || item.layer === 'both') {
        item.instance.draw(this.backFrame, 'back');
        hasBack = true;
      }
      if (item.layer === 'front' || item.layer === 'both') {
        item.instance.draw(this.frontFrame, 'front');
        hasFront = true;
      }
    }

    if (hasBack) {
      composite(this.backFrame, this.backImg.data, null, 1.0);
      this.backCtx.putImageData(this.backImg, 0, 0);
    } else {
      this.backCtx.clearRect(0, 0, this.width, this.height);
    }

    if (hasFront) {
      composite(this.frontFrame, this.frontImg.data, null, 1.0);
      this.frontCtx.putImageData(this.frontImg, 0, 0);
    } else {
      this.frontCtx.clearRect(0, 0, this.width, this.height);
    }
  }

  public drawBackLayer(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.backCanvas, 0, 0);
  }

  public drawFrontLayer(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.frontCanvas, 0, 0);
  }
}
