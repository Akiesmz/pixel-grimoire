import './style.css';
import { ELEMENT_INFO, SPELL_MAP } from './data/spells';
import { getTalentCost, TALENTS } from './data/talents';
import { WIZARDS } from './data/wizards';
import { GameEngine, type HudSnapshot } from './game/engine';
import type { UpgradeChoice, WizardId } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const modalSelect = document.getElementById('modal-select')!;
const modalTalents = document.getElementById('modal-talents')!;
const modalLevelup = document.getElementById('modal-levelup')!;
const modalPause = document.getElementById('modal-pause')!;
const modalEnd = document.getElementById('modal-end')!;

const wizardGrid = document.getElementById('wizard-grid')!;
const talentsGrid = document.getElementById('talents-grid')!;
const selectDustEl = document.getElementById('select-dust')!;
const talentsDustEl = document.getElementById('talents-dust')!;
const upgradeGrid = document.getElementById('upgrade-grid')!;
const levelupTitle = document.getElementById('levelup-title')!;
const btnReroll = document.getElementById('btn-reroll') as HTMLButtonElement;

const xpBarFill = document.getElementById('xp-bar-fill')!;
const hudLevel = document.getElementById('hud-level')!;
const hpBarFill = document.getElementById('hp-bar-fill')!;
const hudHpText = document.getElementById('hud-hp-text')!;
const dashBarFill = document.getElementById('dash-bar-fill')!;
const hudTimer = document.getElementById('hud-timer')!;
const hudWave = document.getElementById('hud-wave')!;
const hudKills = document.getElementById('hud-kills')!;
const hudDust = document.getElementById('hud-dust')!;
const spellBar = document.getElementById('spell-bar')!;

const bossBarWrap = document.getElementById('boss-bar-wrap')!;
const bossNameEl = document.getElementById('boss-name')!;
const bossFill = document.getElementById('boss-fill')!;
const bannerEl = document.getElementById('banner')!;

const objectiveCard = document.getElementById('objective-card')!;
const objTitle = document.getElementById('obj-title')!;
const objDesc = document.getElementById('obj-desc')!;
const objFill = document.getElementById('obj-fill')!;

const btnAim = document.getElementById('btn-aim')!;
const btnMute = document.getElementById('btn-mute')!;
const btnPause = document.getElementById('btn-pause')!;
const btnResume = document.getElementById('btn-resume')!;
const btnQuit = document.getElementById('btn-quit')!;
const btnRestart = document.getElementById('btn-restart')!;
const btnEndless = document.getElementById('btn-endless')!;
const btnEndSelect = document.getElementById('btn-end-select')!;
const btnOpenTalents = document.getElementById('btn-open-talents')!;
const btnEndTalents = document.getElementById('btn-end-talents')!;
const btnCloseTalents = document.getElementById('btn-close-talents')!;
const btnResetTalents = document.getElementById('btn-reset-talents')!;

const pauseStats = document.getElementById('pause-stats')!;
const endTitle = document.getElementById('end-title')!;
const endSubtitle = document.getElementById('end-subtitle')!;
const endStats = document.getElementById('end-stats')!;

let currentWizardId: WizardId = 'pyro';
let currentChoices: UpgradeChoice[] = [];
let talentsModalOpen = false;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const engine = new GameEngine(canvas, {
  onHudUpdate: renderHud,
  onLevelUpChoices: renderLevelUpChoices,
});

function renderTalentTree(): void {
  const save = engine.getMetaSave();
  selectDustEl.textContent = String(save.dust);
  talentsDustEl.textContent = String(save.dust);
  talentsGrid.innerHTML = '';

  for (const def of TALENTS) {
    const rank = save.ranks[def.id] ?? 0;
    const isMax = rank >= def.maxRank;
    const cost = getTalentCost(def, rank);
    const canBuy = !isMax && save.dust >= cost;

    const card = document.createElement('div');
    card.className = `talent-card${isMax ? ' maxed' : ''}`;
    card.innerHTML = `
      <div class="talent-top">
        <span class="talent-icon">${def.icon}</span>
        <span class="talent-rank">Lv.${rank} / ${def.maxRank}</span>
      </div>
      <div class="talent-name">${def.name}</div>
      <div class="talent-bonus">${def.perRankLabel}</div>
      <div class="talent-desc">${def.desc}</div>
      <button class="talent-buy-btn" ${canBuy ? '' : 'disabled'}>
        ${isMax ? '✨ 已满级' : `升级 · ✨ ${cost}`}
      </button>
    `;
    const btn = card.querySelector('.talent-buy-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      if (engine.purchaseTalent(def.id)) {
        renderTalentTree();
      }
    });
    talentsGrid.appendChild(card);
  }
}

function openTalentsModal(): void {
  talentsModalOpen = true;
  renderTalentTree();
  modalTalents.classList.remove('hidden');
  engine.pushHud();
}

function closeTalentsModal(): void {
  talentsModalOpen = false;
  modalTalents.classList.add('hidden');
  renderTalentTree();
  engine.pushHud();
}

// Build Wizard Select Cards
for (const wiz of WIZARDS) {
  const startSpell = SPELL_MAP[wiz.startSpell];
  const card = document.createElement('div');
  card.className = 'wizard-card';
  card.innerHTML = `
    <div class="wiz-head">
      <div class="wiz-avatar" style="background:${wiz.colorPrimary}; box-shadow: 0 0 12px ${wiz.colorGlow}66;">
        ${startSpell.icon}
      </div>
      <div>
        <div class="wiz-name">${wiz.name}</div>
        <div class="wiz-title">${wiz.title}</div>
      </div>
    </div>
    <div class="wiz-desc">${wiz.desc}</div>
    <div class="wiz-start-spell">初始法术：<b>${startSpell.name}</b></div>
    <div class="wiz-passive">${wiz.passiveDesc}</div>
  `;
  card.addEventListener('click', () => {
    currentWizardId = wiz.id;
    engine.startRun(wiz.id);
  });
  wizardGrid.appendChild(card);
}

renderTalentTree();

function renderLevelUpChoices(choices: UpgradeChoice[], title: string, rerollsLeft: number): void {
  currentChoices = choices;
  levelupTitle.textContent = title;
  upgradeGrid.innerHTML = '';

  btnReroll.disabled = rerollsLeft <= 0;
  btnReroll.textContent =
    rerollsLeft > 0 ? `🔄 刷新选项 (剩余 ${rerollsLeft} 次) [R]` : '🔄 刷新次数已用完';

  choices.forEach((choice, idx) => {
    const card = document.createElement('div');
    card.className = `upgrade-card rarity-${choice.rarity}`;
    card.innerHTML = `
      <div class="upg-top">
        <span class="upg-icon">${choice.icon}</span>
        <span class="upg-badge" style="background:${choice.accentColor}">${choice.badge}</span>
      </div>
      <div class="upg-title">${choice.title}</div>
      <div class="upg-sub">${choice.subtitle}</div>
      <div class="upg-desc">${choice.desc}</div>
      <div class="upg-key">快捷键 [${idx + 1}]</div>
    `;
    card.addEventListener('click', () => {
      engine.selectUpgrade(choice);
    });
    upgradeGrid.appendChild(card);
  });
}

window.addEventListener('keydown', (e) => {
  if (engine.phase !== 'levelup') return;
  if (e.code === 'Digit1' && currentChoices[0]) engine.selectUpgrade(currentChoices[0]);
  if (e.code === 'Digit2' && currentChoices[1]) engine.selectUpgrade(currentChoices[1]);
  if (e.code === 'Digit3' && currentChoices[2]) engine.selectUpgrade(currentChoices[2]);
  if (e.code === 'KeyR') engine.rerollUpgrades();
});

function renderStatsGrid(target: HTMLElement, snap: HudSnapshot): void {
  target.innerHTML = `
    <div class="stat-box"><div class="stat-box-label">巫师 / 等级</div><div class="stat-box-val">${snap.wizardName} · Lv.${snap.level}</div></div>
    <div class="stat-box"><div class="stat-box-label">存活 / 击杀 / 星尘</div><div class="stat-box-val">${formatTime(snap.elapsed)} · ${snap.kills} · ✨${snap.runDust}</div></div>
    <div class="stat-box"><div class="stat-box-label">法术伤害 / 暴击</div><div class="stat-box-val">${snap.stats.damagePct}% · ${snap.stats.critPct}%</div></div>
    <div class="stat-box"><div class="stat-box-label">冷却缩减 / 范围</div><div class="stat-box-val">-${snap.stats.cooldownPct}% · ${snap.stats.areaPct}%</div></div>
    <div class="stat-box"><div class="stat-box-label">经验获取效率</div><div class="stat-box-val">${snap.stats.xpPct}%</div></div>
    <div class="stat-box"><div class="stat-box-label">自动拾取 / 刷新</div><div class="stat-box-val">${snap.stats.pickupRadius}px · ${snap.stats.rerollsPerLevelUp}次</div></div>
  `;
}

function renderHud(snap: HudSnapshot): void {
  selectDustEl.textContent = String(engine.getMetaSave().dust);
  modalSelect.classList.toggle('hidden', snap.phase !== 'select' || talentsModalOpen);
  modalLevelup.classList.toggle('hidden', snap.phase !== 'levelup');
  modalPause.classList.toggle('hidden', snap.phase !== 'paused');
  modalEnd.classList.toggle('hidden', (snap.phase !== 'gameover' && snap.phase !== 'victory') || talentsModalOpen);
  hud.classList.toggle('hidden', snap.phase === 'select');

  if (snap.phase === 'select') return;

  const xpPct = Math.min(100, (snap.xp / Math.max(1, snap.xpToNext)) * 100);
  xpBarFill.style.width = `${xpPct.toFixed(1)}%`;
  hudLevel.textContent = `Lv.${snap.level}`;

  const hpPct = Math.min(100, Math.max(0, (snap.hp / Math.max(1, snap.maxHp)) * 100));
  hpBarFill.style.width = `${hpPct.toFixed(1)}%`;
  hudHpText.textContent = `${snap.hp} / ${snap.maxHp}`;

  dashBarFill.style.width = `${(snap.dashReadyRatio * 100).toFixed(0)}%`;

  hudTimer.textContent = formatTime(snap.elapsed);
  hudWave.textContent = snap.endless ? `无尽 波次 ${snap.wave}` : `波次 ${snap.wave}`;
  hudKills.textContent = `☠ ${snap.kills}`;
  hudDust.textContent = `✨ ${snap.runDust}`;

  btnAim.textContent = snap.manualAim ? '🎯 手动瞄准' : '✨ 自动瞄准';
  btnMute.textContent = snap.muted ? '🔇 静音' : '🔊 音效';

  if (snap.boss) {
    bossBarWrap.classList.remove('hidden');
    bossNameEl.textContent = `👑 ${snap.boss.name} (${snap.boss.hp} / ${snap.boss.maxHp})`;
    bossFill.style.width = `${((snap.boss.hp / Math.max(1, snap.boss.maxHp)) * 100).toFixed(1)}%`;
  } else {
    bossBarWrap.classList.add('hidden');
  }

  if (snap.banner) {
    bannerEl.textContent = snap.banner;
    bannerEl.classList.remove('hidden');
  } else {
    bannerEl.classList.add('hidden');
  }

  if (snap.objective) {
    objectiveCard.classList.remove('hidden');
    objTitle.textContent = snap.objective.title;
    objDesc.textContent = snap.objective.desc;
    objFill.style.width = `${Math.round(snap.objective.progress * 100)}%`;
  } else {
    objectiveCard.classList.add('hidden');
  }

  spellBar.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const s = snap.spells[i];
    const slot = document.createElement('div');
    if (s) {
      const def = SPELL_MAP[s.id];
      const elColor = s.element !== 'none' ? ELEMENT_INFO[s.element].color : def.baseColor;
      slot.className = 'spell-slot';
      slot.style.borderColor = elColor;
      slot.title = `${def.name} Lv.${s.level}${s.element !== 'none' ? ` · ${ELEMENT_INFO[s.element].short}` : ''}`;
      slot.innerHTML = `
        <span>${def.icon}</span>
        <span class="spell-el-dot" style="background:${elColor}"></span>
        <span class="spell-lv">Lv.${s.level}</span>
      `;
    } else {
      slot.className = 'spell-slot empty';
      slot.textContent = '+';
    }
    spellBar.appendChild(slot);
  }

  if (snap.phase === 'paused') {
    renderStatsGrid(pauseStats, snap);
  } else if (snap.phase === 'gameover' || snap.phase === 'victory') {
    const isWin = snap.phase === 'victory';
    endTitle.textContent = isWin ? '🏆 凯旋！击败虚空大君' : '💀 巫师陨落';
    endSubtitle.textContent = isWin
      ? `本局获得 ✨ ${snap.runDust} 星尘，已存入永久天赋树！`
      : `本局获得 ✨ ${snap.runDust} 星尘，可前往永久天赋树强化后再战！`;
    btnEndless.classList.toggle('hidden', !isWin);
    renderStatsGrid(endStats, snap);
  }
}

btnAim.addEventListener('click', () => engine.toggleAimMode());
btnMute.addEventListener('click', () => engine.toggleMute());
btnPause.addEventListener('click', () => engine.togglePause());
btnResume.addEventListener('click', () => engine.togglePause());
btnQuit.addEventListener('click', () => engine.returnToSelect());
btnRestart.addEventListener('click', () => engine.startRun(currentWizardId));
btnEndless.addEventListener('click', () => engine.continueEndless());
btnEndSelect.addEventListener('click', () => engine.returnToSelect());
btnReroll.addEventListener('click', () => engine.rerollUpgrades());
btnOpenTalents.addEventListener('click', openTalentsModal);
btnEndTalents.addEventListener('click', openTalentsModal);
btnCloseTalents.addEventListener('click', closeTalentsModal);
btnResetTalents.addEventListener('click', () => {
  engine.resetAllTalents();
  renderTalentTree();
});
