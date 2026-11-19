import type { Enemy, Gem, PlayerState, WizardDef } from '../types';

function hash2d(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function drawArenaGround(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  time: number
): void {
  // Base dark slate arcane ground
  ctx.fillStyle = '#141320';
  ctx.fillRect(0, 0, viewW, viewH);

  const tile = 32;
  const startTx = Math.floor(camX / tile) - 1;
  const endTx = Math.floor((camX + viewW) / tile) + 1;
  const startTy = Math.floor(camY / tile) - 1;
  const endTy = Math.floor((camY + viewH) / tile) + 1;

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const sx = Math.round(tx * tile - camX);
      const sy = Math.round(ty * tile - camY);
      const r = hash2d(tx, ty);

      // Subtle checkerboard stone slab variation
      const isAlt = ((tx + ty) & 1) === 0;
      ctx.fillStyle = isAlt ? '#181726' : '#151422';
      ctx.fillRect(sx + 1, sy + 1, tile - 2, tile - 2);

      // Subtle top-left bevel highlight
      ctx.fillStyle = '#201e33';
      ctx.fillRect(sx + 1, sy + 1, tile - 2, 1);

      // Occasional stone cracks / moss / arcane floor rune
      if (r < 0.14) {
        ctx.fillStyle = '#0e0d17';
        ctx.fillRect(sx + 6, sy + 10, 6, 1);
        ctx.fillRect(sx + 11, sy + 11, 4, 1);
        ctx.fillRect(sx + 14, sy + 12, 2, 2);
      } else if (r < 0.24) {
        // Mossy patch
        ctx.fillStyle = '#1b2b27';
        ctx.fillRect(sx + 4, sy + 22, 5, 3);
        ctx.fillStyle = '#233b33';
        ctx.fillRect(sx + 5, sy + 23, 3, 1);
      } else if (r > 0.965) {
        // Faint glowing ancient floor glyph
        const pulse = 0.25 + 0.2 * Math.sin(time * 2.2 + tx + ty);
        ctx.fillStyle = `rgba(116, 86, 214, ${pulse.toFixed(2)})`;
        ctx.fillRect(sx + 14, sy + 10, 4, 1);
        ctx.fillRect(sx + 15, sy + 11, 2, 10);
        ctx.fillRect(sx + 12, sy + 15, 8, 1);
        ctx.fillRect(sx + 14, sy + 21, 4, 1);
      }
    }
  }
}

export function drawWizard(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  wiz: WizardDef,
  sx: number,
  sy: number,
  time: number
): void {
  // Blink when invulnerable after taking damage
  if (player.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) {
    return;
  }

  const moving = Math.hypot(player.vx, player.vy) > 5;
  const bob = moving ? Math.round(Math.sin(player.animTime * 14) * 1.4) : Math.round(Math.sin(time * 4) * 0.6);
  const px = Math.round(sx);
  const py = Math.round(sy);

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(px - 6, py + 5, 12, 4);

  ctx.save();
  ctx.translate(px, py + bob);
  if (player.facing < 0) ctx.scale(-1, 1);

  // Dark outline behind robe
  ctx.fillStyle = '#09080f';
  ctx.fillRect(-6, -12, 12, 18);

  // Robe body
  ctx.fillStyle = wiz.colorPrimary;
  ctx.fillRect(-5, -4, 10, 9);
  ctx.fillStyle = wiz.colorAccent;
  ctx.fillRect(-1, -4, 2, 9); // center trim

  // Feet (animated)
  const step = moving ? Math.round(Math.sin(player.animTime * 14) * 2) : 0;
  ctx.fillStyle = '#1f1a29';
  ctx.fillRect(-4 + step, 5, 3, 2);
  ctx.fillRect(1 - step, 5, 3, 2);

  // Face / hood shadow + glowing eyes
  ctx.fillStyle = '#120e1c';
  ctx.fillRect(-4, -9, 8, 5);
  ctx.fillStyle = wiz.colorAccent;
  ctx.fillRect(0, -7, 2, 2);
  ctx.fillRect(3, -7, 1, 2);

  // Pointed wizard hat
  ctx.fillStyle = wiz.colorHat;
  ctx.fillRect(-7, -10, 14, 2); // brim
  ctx.fillRect(-5, -13, 10, 3);
  ctx.fillRect(-3, -16, 6, 3);
  ctx.fillRect(-2, -18, 3, 2);
  // Hat band
  ctx.fillStyle = wiz.colorAccent;
  ctx.fillRect(-5, -11, 10, 1);

  // Wooden magic staff held in front
  ctx.fillStyle = '#6b472b';
  ctx.fillRect(6, -11, 2, 16);
  // Glowing crystal orb atop staff
  const glow = 0.65 + 0.35 * Math.sin(time * 7);
  ctx.fillStyle = wiz.colorGlow;
  ctx.fillRect(5, -14, 4, 4);
  ctx.fillStyle = `rgba(255, 255, 255, ${glow.toFixed(2)})`;
  ctx.fillRect(6, -13, 2, 2);

  ctx.restore();
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  sx: number,
  sy: number,
  time: number
): void {
  const px = Math.round(sx);
  const py = Math.round(sy);
  const wobble = Math.round(Math.sin(e.animTime * 10) * 1.2);
  const flash = e.hitFlash > 0;
  const chilled = e.slowTimer > 0;

  // Shadow
  const shW = Math.round(e.radius * 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(px - Math.floor(shW / 2), py + Math.round(e.radius * 0.5), shW, 4);

  // Boss pulsing aura ring
  if (e.isBoss || e.isElite) {
    ctx.strokeStyle = e.isBoss ? 'rgba(255, 72, 72, 0.7)' : 'rgba(255, 200, 72, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(px, py + Math.round(e.radius * 0.55), e.radius + 3, Math.round(e.radius * 0.45) + 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(px, py + wobble);
  if (e.facing < 0) ctx.scale(-1, 1);

  if (e.kind === 'slime') {
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(-7, -5, 14, 11);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#62d4ff' : '#6c3bb8';
    ctx.fillRect(-6, -4, 12, 9);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#b8f3ff' : '#a66bff';
    ctx.fillRect(-4, -3, 8, 3);
    ctx.fillStyle = '#ffec73';
    ctx.fillRect(-2, -1, 2, 2);
    ctx.fillRect(2, -1, 2, 2);
  } else if (e.kind === 'dasher') {
    // Skeletal fast runner
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(-5, -9, 10, 15);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#8ce3ff' : '#d6d0c4';
    ctx.fillRect(-4, -8, 8, 6); // skull
    ctx.fillRect(-3, -2, 6, 7); // ribs
    ctx.fillStyle = '#ff3d4d';
    ctx.fillRect(0, -6, 2, 2);
    ctx.fillRect(3, -6, 1, 2);
  } else if (e.kind === 'bat') {
    const wing = Math.round(Math.sin(time * 22 + e.id) * 3);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#5cd6ff' : '#43205c';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.fillRect(-9, -2 + wing, 6, 3);
    ctx.fillRect(3, -2 + wing, 6, 3);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(-1, -1, 1, 1);
    ctx.fillRect(2, -1, 1, 1);
  } else if (e.kind === 'brute') {
    ctx.fillStyle = '#09080f';
    ctx.fillRect(-9, -12, 18, 22);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#4ca8d6' : '#3a5e3f';
    ctx.fillRect(-8, -11, 16, 20);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#8de3ff' : '#56875a';
    ctx.fillRect(-7, -10, 14, 6);
    // Horns
    ctx.fillStyle = '#d9ccb2';
    ctx.fillRect(-8, -14, 3, 4);
    ctx.fillRect(5, -14, 3, 4);
    // Eyes
    ctx.fillStyle = '#ff5733';
    ctx.fillRect(-2, -6, 2, 2);
    ctx.fillRect(3, -6, 2, 2);
  } else if (e.kind === 'caster') {
    // Hooded abyssal cultist
    ctx.fillStyle = '#0a0712';
    ctx.fillRect(-6, -11, 12, 19);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#4794d1' : '#571845';
    ctx.fillRect(-5, -10, 10, 17);
    ctx.fillStyle = '#ff427b';
    ctx.fillRect(0, -7, 2, 2);
    ctx.fillRect(3, -7, 1, 2);
    // Floating orb
    ctx.fillStyle = '#ff578f';
    ctx.fillRect(6, -5 + Math.round(Math.sin(time * 8) * 2), 3, 3);
  } else if (e.kind === 'golem') {
    ctx.fillStyle = '#09080f';
    ctx.fillRect(-11, -14, 22, 26);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#55aacc' : '#524b63';
    ctx.fillRect(-10, -13, 20, 24);
    ctx.fillStyle = flash ? '#ffffff' : '#857c9c';
    ctx.fillRect(-9, -12, 18, 7);
    // Glowing rune core
    ctx.fillStyle = '#ffae33';
    ctx.fillRect(-3, -2, 6, 6);
    ctx.fillRect(-4, -9, 3, 2);
    ctx.fillRect(2, -9, 3, 2);
  } else {
    // Bosses (boss_ember, boss_storm, boss_void)
    const primary =
      e.kind === 'boss_ember' ? '#a81e19' : e.kind === 'boss_storm' ? '#2c4fa8' : '#4a1475';
    const accent =
      e.kind === 'boss_ember' ? '#ff962e' : e.kind === 'boss_storm' ? '#ffe852' : '#e066ff';

    ctx.fillStyle = '#07060d';
    ctx.fillRect(-16, -22, 32, 38);
    ctx.fillStyle = flash ? '#ffffff' : chilled ? '#52b8e8' : primary;
    ctx.fillRect(-15, -21, 30, 36);
    ctx.fillStyle = flash ? '#ffffff' : accent;
    // Crown / horns
    ctx.fillRect(-14, -26, 4, 6);
    ctx.fillRect(-3, -28, 6, 8);
    ctx.fillRect(10, -26, 4, 6);
    // Glowing chest core & eyes
    ctx.fillRect(-6, -13, 4, 3);
    ctx.fillRect(3, -13, 4, 3);
    ctx.fillRect(-5, -3, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, 0, 4, 4);
  }

  ctx.restore();

  // Status indicators (burn embers / poison bubbles / stun stars)
  if (e.burnTimer > 0) {
    ctx.fillStyle = '#ff7b24';
    const fx = px + Math.round(Math.sin(time * 16 + e.id) * 4);
    ctx.fillRect(fx, py - e.radius - 4, 2, 3);
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(fx, py - e.radius - 3, 1, 1);
  }
  if (e.poisonTimer > 0) {
    ctx.fillStyle = '#a6e22e';
    const pbx = px + Math.round(Math.cos(time * 10 + e.id) * 5);
    const pby = py - e.radius - 3 - Math.round((time * 8 + e.id) % 4);
    ctx.fillRect(pbx, pby, 2, 2);
  }
  if (e.stunTimer > 0) {
    ctx.fillStyle = '#ffe852';
    ctx.fillRect(px - 4, py - e.radius - 6, 2, 2);
    ctx.fillRect(px + 2, py - e.radius - 6, 2, 2);
  }

  // Mini HP bar for elites or damaged non-boss tanky enemies
  if (!e.isBoss && (e.isElite || e.hp < e.maxHp)) {
    const bw = Math.max(12, Math.round(e.radius * 1.6));
    const ratio = Math.max(0, e.hp / e.maxHp);
    const bx = px - Math.floor(bw / 2);
    const by = py - Math.round(e.radius) - 7;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = e.isElite ? '#ffbe33' : '#e63946';
    ctx.fillRect(bx, by, Math.round(bw * ratio), 2);
  }
}

export function drawGem(
  ctx: CanvasRenderingContext2D,
  g: Gem,
  sx: number,
  sy: number,
  time: number
): void {
  const px = Math.round(sx);
  const py = Math.round(sy + Math.sin(time * 5 + g.bobPhase) * 1.5);

  if (g.kind === 'xp_small' || g.kind === 'xp_med' || g.kind === 'xp_large') {
    const color =
      g.kind === 'xp_large' ? '#ff5ce1' : g.kind === 'xp_med' ? '#4df0ff' : '#57ff8a';
    const r = g.kind === 'xp_large' ? 4 : g.kind === 'xp_med' ? 3 : 2;
    ctx.fillStyle = '#0a0912';
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
    ctx.fillStyle = color;
    ctx.fillRect(px - r + 1, py - r + 1, r * 2 - 2, r * 2 - 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, py - 1, 1, 1);
  } else if (g.kind === 'heal') {
    ctx.fillStyle = '#0a0912';
    ctx.fillRect(px - 4, py - 4, 8, 8);
    ctx.fillStyle = '#ff4769';
    ctx.fillRect(px - 3, py - 3, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, py - 2, 2, 4);
    ctx.fillRect(px - 2, py - 1, 4, 2);
  } else if (g.kind === 'magnet') {
    ctx.fillStyle = '#0a0912';
    ctx.fillRect(px - 4, py - 4, 8, 8);
    ctx.fillStyle = '#3da5ff';
    ctx.fillRect(px - 3, py - 3, 6, 6);
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(px - 3, py - 3, 6, 2);
  } else if (g.kind === 'chest') {
    // Golden relic chest
    ctx.fillStyle = '#09080f';
    ctx.fillRect(px - 7, py - 6, 14, 12);
    ctx.fillStyle = '#9e5a20';
    ctx.fillRect(px - 6, py - 5, 12, 10);
    ctx.fillStyle = '#ffd147';
    ctx.fillRect(px - 6, py - 5, 12, 2);
    ctx.fillRect(px - 6, py, 12, 2);
    ctx.fillRect(px - 2, py - 2, 4, 4);
    // Sparkle
    if (Math.floor(time * 6) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 5, py - 8, 2, 2);
      ctx.fillRect(px + 4, py - 7, 2, 2);
    }
  }
}
