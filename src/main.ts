import { Game } from './core/game';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { ShopView } from './ui/shopView';
import { MapView } from './ui/mapView';
import { SlotMachineView } from './ui/slotMachineView';
import { Fx } from './ui/fx';
import { Sfx } from './audio/sfx';
import { PrototypeManager } from './core/prototypeModes';

/** Starter loadout: empty so the game starts vanilla without overwhelming the player. */
const STARTER: string[] = [];

const boardEl = document.getElementById('board')!;
const headerEl = (document.querySelector('.header') || boardEl) as HTMLElement;
const sfx = new Sfx();
const fx = new Fx();
let game = new Game(STARTER.map(getModule));
const proto = new PrototypeManager(game);

const view = new BoardView(boardEl, (x, y, action) => {
  const cell = game.board.get(x, y);

  // --- MODE 3: CLAIMING / HAND SELECTION ---
  if (proto.currentMode === 'mode3_claim') {
    if (action === 'flag') {
      game.toggleFlag(x, y);
      checkSlotAutoRoll();
      return;
    }
    // Clicking an already revealed number cell toggles selection for the Hand
    if (cell && cell.revealed && !cell.mine && !cell.frozen) {
      proto.toggleSelectCell(cell);
      view.setSelectedCells(proto.selectedCells);
      updateHandBar();
      sfx.click();
      return;
    }
    // Clicking an unrevealed cell reveals it
    game.click(x, y);
    checkSlotAutoRoll();
    return;
  }

  // --- MODE 1: CHORD КАК РУКА ---
  if (proto.currentMode === 'mode1_chord') {
    if (action === 'flag') {
      game.toggleFlag(x, y);
      checkSlotAutoRoll();
      return;
    }
    if (cell && cell.revealed && cell.adjacent > 0) {
      const ns = game.board.neighbors(cell);
      const flagCount = ns.filter((n) => n.flagged || n.defused).length;
      if (flagCount === cell.adjacent) {
        const targets = ns.filter((n) => !n.revealed && !n.flagged && !n.frozen);
        const prevRevealed = game.board.cells.filter((c) => c.revealed).length;

        game.click(x, y);
        checkSlotAutoRoll();

        const newlyRevealed = game.board.cells.filter((c) => c.revealed).length - prevRevealed;
        if (targets.length > 0 && newlyRevealed > 0) {
          const evalRes = proto.evaluateChord(cell, targets, newlyRevealed > targets.length ? 1 : 0);
          game.score += evalRes.totalScore;
          sfx.jackpotFanfare();
          fx.balatroPopup(evalRes.name, evalRes.chips, evalRes.mult, evalRes.totalScore, evalRes.badge);
          hud.log(`🎯 <b>${evalRes.name}:</b> ${evalRes.chips} Chips × x${evalRes.mult} Mult = +${evalRes.totalScore} PTS!`, 'super');
          if (game.score >= game.target && !game.cleared) {
            game.cleared = true;
            game.emit({ type: 'cleared' });
          }
          hud.render();
        }
        return;
      }
    }
    game.click(x, y);
    checkSlotAutoRoll();
    return;
  }

  // --- MODE 2: ПАТТЕРНЫ САПЁРА ---
  if (proto.currentMode === 'mode2_patterns') {
    if (action === 'flag') {
      game.toggleFlag(x, y);
      checkSlotAutoRoll();
      return;
    }
    const prevZeroes = game.board.cells.filter((c) => c.revealed && c.adjacent === 0).length;
    game.click(x, y);
    checkSlotAutoRoll();
    const currZeroes = game.board.cells.filter((c) => c.revealed && c.adjacent === 0).length;
    const cascadeZeroes = currZeroes - prevZeroes;

    if (cell && cell.revealed && !cell.mine) {
      const patternRes = proto.detectPattern(game.board, cell, cascadeZeroes);
      if (patternRes.chips > 20) {
        game.score += patternRes.totalScore;
        sfx.jackpotFanfare();
        fx.balatroPopup(patternRes.name, patternRes.chips, patternRes.mult, patternRes.totalScore, patternRes.badge);
        hud.log(`📐 <b>${patternRes.name}:</b> ${patternRes.chips} Chips × x${patternRes.mult} Mult = +${patternRes.totalScore} PTS!`, 'super');
        if (game.score >= game.target && !game.cleared) {
          game.cleared = true;
          game.emit({ type: 'cleared' });
        }
        hud.render();
      }
    }
    return;
  }

  // --- VANILLA DEFAULT ---
  if (action === 'flag') {
    game.toggleFlag(x, y);
    checkSlotAutoRoll();
  } else {
    game.click(x, y);
    checkSlotAutoRoll();
  }
});

const shopView = new ShopView(game, {
  onStartStage: () => {
    game.nextStage();
    sfx.relay();
    hud.render();
    mapView.render();
  },
  onBuy: () => {
    sfx.click();
  },
  onReroll: () => {
    sfx.relay();
  },
});

const mapView = new MapView(game, {
  onSelectBattle: (node) => {
    sfx.click();
    view.build(game.board);
    hud.render();
    mapView.render();
    const isBoss = node.type === 'boss';
    const bannerText = isBoss
      ? `👑 ${node.name.toUpperCase()}\nАРЕНА БОССА 14×14`
      : `${node.name.toUpperCase()}\nЦЕЛЬ: ${game.target}`;
    fx.banner(headerEl, bannerText, isBoss ? 'rainbow' : 'bits');
  },
  onOpenShop: () => {
    sfx.relay();
    hud.render();
    shopView.render();
  },
  onPlaySfx: (type) => {
    if (type === 'fanfare') sfx.jackpotFanfare();
    else if (type === 'relay') sfx.relay();
    else sfx.click();
  },
});

const SAVE_KEY = 'minesweeper_pro_save';

const saveProgress = () => {
  try {
    const saveData = {
      stage: game.stage,
      score: game.score,
      target: game.target,
      clicks: game.clicks,
      hull: game.hull,
      bits: game.bits,
      combo: game.combo,
      roundMult: game.roundMult,
      modules: game.modules.map((m) => m.id),
      consumables: game.consumables.map((c) => c.id),
      fairies: game.fairies,
      actFairiesSpawned: game.actFairiesSpawned,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    sfx.relay();
    fx.banner(headerEl, '💾 ПРОГРЕСС СОХРАНЁН!', 'bits');
    hud.showBonus(['💾 ПРОГРЕСС СОХРАНЁН', 'В ЛОКАЛЬНОЕ ХРАНИЛИЩЕ'], false);
  } catch (err) {
    console.error('Save failed', err);
  }
};

const restart = () => {
  localStorage.removeItem(SAVE_KEY);
  fx.clear();
  game = new Game(STARTER.map(getModule));
  proto.setGame(game);
  proto.clearSelection();
  wire(game);
  hud.setGame(game);
  shopView.setGame(game);
  mapView.setGame(game);
  slotMachine.setGame(game);
  view.build(game.board);
  updateModeUI();
  hud.render();
  shopView.render();
  mapView.render();
  sfx.click();
  hud.log('── Начат новый забег ──', 'sep');
  fx.banner(headerEl, 'НОВЫЙ ЗАБЕГ\nС НАЧАЛА', 'rainbow');
};

document.getElementById('btn-menu-save')?.addEventListener('click', saveProgress);
document.getElementById('btn-menu-restart')?.addEventListener('click', () => {
  if (confirm('Начать забег с самого начала? Текущий прогресс будет сброшен.')) {
    restart();
  }
});

function updateModeUI() {
  const banner = document.getElementById('proto-mode-banner');
  const badge = document.getElementById('proto-badge');
  const desc = document.getElementById('proto-desc');
  const handBar = document.getElementById('proto-hand-bar');

  const btn1 = document.getElementById('btn-mode-1');
  const btn2 = document.getElementById('btn-mode-2');
  const btn3 = document.getElementById('btn-mode-3');
  const btnVanilla = document.getElementById('btn-mode-vanilla');

  [btn1, btn2, btn3, btnVanilla].forEach((b) => b?.classList.remove('active'));

  if (!banner || !badge || !desc || !handBar) return;

  if (proto.currentMode === 'mode1_chord') {
    btn1?.classList.add('active');
    banner.style.display = 'flex';
    badge.textContent = '🎯 1: ХОРД';
    desc.textContent = 'Ставьте флаги вокруг цифр и кликайте по цифре (хорд). Хорд вскрывает пачку безопасных клеток и начисляет сочный залп Chips × Mult!';
    handBar.style.display = 'none';
  } else if (proto.currentMode === 'mode2_patterns') {
    btn2?.classList.add('active');
    banner.style.display = 'flex';
    badge.textContent = '📐 2: ПАТТЕРНЫ';
    desc.textContent = 'Ищите классические связки Сапёра: 1-2-1, 1-2-2-1, Оазисы нулей, Угловые тройки и Стены цифр!';
    handBar.style.display = 'none';
  } else if (proto.currentMode === 'mode3_claim') {
    btn3?.classList.add('active');
    banner.style.display = 'flex';
    badge.textContent = '🃏 3: СБОР РУКИ';
    desc.textContent = 'Открывайте поле. Кликайте по уже открытым цифрам (до 5 шт) для сбора комбинации и жмите [СЫГРАТЬ РУКУ]! (Стриты, Сеты, Пары)';
    handBar.style.display = 'flex';
    updateHandBar();
  } else {
    btnVanilla?.classList.add('active');
    banner.style.display = 'none';
    handBar.style.display = 'none';
  }

  view.setSelectedCells(proto.selectedCells);
}

function updateHandBar() {
  const handCardsEl = document.getElementById('proto-hand-cards');
  const handNameEl = document.getElementById('proto-hand-name');
  const mathEl = document.getElementById('proto-hand-math');
  const btnPlay = document.getElementById('btn-play-hand') as HTMLButtonElement | null;
  const handsLeftEl = document.getElementById('proto-hands-left');

  if (!handCardsEl || !handNameEl || !mathEl || !btnPlay || !handsLeftEl) return;

  handsLeftEl.textContent = `${proto.handsLeft}/${proto.maxHands}`;

  handCardsEl.innerHTML = '';
  for (let i = 0; i < proto.maxSelected; i++) {
    const c = proto.selectedCells[i];
    const slot = document.createElement('span');
    if (c) {
      slot.className = 'card-slot filled';
      slot.textContent = String(c.adjacent);
    } else {
      slot.className = 'card-slot empty';
    }
    handCardsEl.appendChild(slot);
  }

  const evalResult = proto.evaluateSelectedHand();
  handNameEl.textContent = evalResult.name;
  mathEl.innerHTML = `<span class="chip-pill">${evalResult.chips} Chips</span> × <span class="mult-pill">x${evalResult.mult} Mult</span> = <b id="proto-hand-score">+${evalResult.totalScore} PTS</b>`;

  btnPlay.disabled = proto.selectedCells.length === 0 || proto.handsLeft <= 0;
}

// Mode switch buttons
document.getElementById('btn-mode-1')?.addEventListener('click', () => {
  proto.setMode('mode1_chord');
  view.build(game.board);
  updateModeUI();
  hud.render();
  sfx.relay();
  hud.log('── Включен Тестовый Режим 1: Хорд как Рука ──', 'sep');
  fx.banner(headerEl, 'ТЕСТ РЕЖИМА 1:\nХОРД КАК РУКА', 'rainbow');
});

document.getElementById('btn-mode-2')?.addEventListener('click', () => {
  proto.setMode('mode2_patterns');
  view.build(game.board);
  updateModeUI();
  hud.render();
  sfx.relay();
  hud.log('── Включен Тестовый Режим 2: Паттерны Сапёра ──', 'sep');
  fx.banner(headerEl, 'ТЕСТ РЕЖИМА 2:\nПАТТЕРНЫ САПЁРА', 'rainbow');
});

document.getElementById('btn-mode-3')?.addEventListener('click', () => {
  proto.setMode('mode3_claim');
  view.build(game.board);
  updateModeUI();
  hud.render();
  sfx.relay();
  hud.log('── Включен Тестовый Режим 3: Сбор комбинаций ──', 'sep');
  fx.banner(headerEl, 'ТЕСТ РЕЖИМА 3:\nСБОР КОМБИНАЦИЙ', 'rainbow');
});

document.getElementById('btn-mode-vanilla')?.addEventListener('click', () => {
  proto.setMode('vanilla');
  view.build(game.board);
  updateModeUI();
  hud.render();
  sfx.click();
  hud.log('── Включен Классический режим ──', 'sep');
  fx.banner(headerEl, 'КЛАССИЧЕСКИЙ РЕЖИМ', 'bits');
});

// Mode 3 Hand buttons
document.getElementById('btn-play-hand')?.addEventListener('click', () => {
  if (proto.currentMode !== 'mode3_claim' || proto.selectedCells.length === 0 || proto.handsLeft <= 0) return;
  const evalResult = proto.evaluateSelectedHand();
  proto.handsLeft--;

  game.score += evalResult.totalScore;
  sfx.jackpotFanfare();
  fx.balatroPopup(evalResult.name, evalResult.chips, evalResult.mult, evalResult.totalScore, evalResult.badge || '🃏');
  hud.log(`🃏 <b>Сыграна рука [${evalResult.name}]:</b> ${evalResult.chips} Chips × x${evalResult.mult} Mult = +${evalResult.totalScore} PTS!`, 'super');

  if (game.score >= game.target && !game.cleared) {
    game.cleared = true;
    game.emit({ type: 'cleared' });
  }

  proto.clearSelection();
  view.setSelectedCells([]);
  updateHandBar();
  hud.render();
});

document.getElementById('btn-clear-hand')?.addEventListener('click', () => {
  proto.clearSelection();
  view.setSelectedCells([]);
  updateHandBar();
});

function cellScreen(x: number, y: number) {
  const r = boardEl.getBoundingClientRect();
  const p = view.cellToScreen(x, y);
  return { x: r.left + p.x, y: r.top + p.y };
}

const hud = new Hud(game, {
  smiley: () => {
    if (game.status === 'lost') {
      if (game.fairies > 0) {
        game.useFairyRevive();
        view.build(game.board);
        hud.render();
        sfx.jackpotFanfare();
        fx.banner(headerEl, '🧚 ВТОРОЕ ДЫХАНИЕ!\nСЕКТОР ПЕРЕЗАПУЩЕН', 'rainbow');
        hud.log('🧚 <b>Фея в банке спасла вас:</b> сектор перезапущен с полным HP, забег продолжается!', 'super');
      } else {
        restart();
      }
    } else if (game.status === 'victory') {
      restart();
    } else if (game.cleared && game.status === 'playing') {
      game.advance();
    }
  },
  advance: () => {
    game.advance();
  },
  restart,
  onFairyRevive: () => {
    const ok = game.useFairyRevive();
    if (ok) {
      view.build(game.board);
      hud.render();
      sfx.jackpotFanfare();
      fx.banner(headerEl, '🧚 ВТОРОЕ ДЫХАНИЕ!\nСЕКТОР ПЕРЕЗАПУЩЕН', 'rainbow');
      hud.log('🧚 <b>Фея в банке спасла вас:</b> сектор перезапущен с полным HP, забег продолжается!', 'super');
    }
  },
  onUseConsumable: (idx) => {
    const success = game.useConsumable(idx);
    if (success) {
      sfx.click();
      checkSlotAutoRoll();
    } else {
      sfx.click();
    }
  },
});

const slotMachine = new SlotMachineView({
  game,
  boardEl,
  headerEl,
  view,
  hud,
  sfx,
  fx,
  cellScreen,
});

function checkSlotAutoRoll() {
  if (game.getSlotFlags().length >= 3) {
    void slotMachine.runSlotJackpotRoll();
  }
}

function wire(g: Game) {
  g.on((e) => {
    if (g !== game) return;
    switch (e.type) {
      case 'newBoard':
        view.build(g.board);
        hud.log(`── ${g.stageName} · цель ${g.target} ──`, 'sep');
        break;
      case 'turn': {
        const t = e.result;
        const p = cellScreen(t.origin.x, t.origin.y);

        if (t.exploded) {
          sfx.boom();
          view.kick();
          if (t.comboBroken) sfx.breakCombo();
          fx.burst(p.x, p.y, `<span class="hurt-main">💥 -1 HP</span><small style="color:#ff6666;font-weight:bold;">СЕРИЯ СБИТА</small>`, 'hurt');
        }
        if (t.score > 0) {
          const big = t.score >= g.target * 0.25;
          const lcdScoreEl = document.getElementById('lcd-score');
          fx.burst(
            p.x,
            p.y,
            `<span class="score-main">+${t.score}</span><small>${t.data} × ${t.mult.toFixed(1)}</small>`,
            big ? 'score big' : 'score',
            lcdScoreEl,
          );
        }

        // Trigger vivid frameless bonus animations in sidebar next to bonus badges
        if (t.callouts && t.callouts.length > 0) {
          hud.showBonus(t.callouts, t.exploded);
          const daredevilCallout = t.callouts.find((c) => c.includes('ОТВАГА И СЛАБОУМИЕ'));
          if (daredevilCallout) {
            sfx.jackpotFanfare();
            if (daredevilCallout.includes('ВКЛЮЧЕНО')) {
              fx.banner(headerEl, '🤩 «ОТВАГА И СЛАБОУМИЕ»!\n×10 МНОЖИТЕЛЬ АКТИВЕН', 'rainbow');
            }
          }
          const speedCallout = t.callouts.find((c) => c.includes('НЕ УСЛЕДИТЬ'));
          if (speedCallout) {
            if (speedCallout.includes('ВКЛЮЧЕНО')) {
              sfx.cascade(8);
              fx.banner(headerEl, '🚀 «НЕ УСЛЕДИТЬ»!\n×3 СКОРОСТНОЙ БОНУС!', 'rainbow');
            } else {
              sfx.cascade(4);
            }
          }
        }
        if (t.score > 0) {
          const multDetails = t.xMult !== 1 ? `${t.mult.toFixed(2)} × ${t.xMult}` : `${t.mult.toFixed(2)}`;
          hud.log(`<b>+${t.score}</b> <span class="log-detail">(${t.data} данн. × ${multDetails} · ${t.cells} кл.)</span>`, 'score');
        } else if (t.exploded) {
          hud.log(`💥 <b>Подрыв на мине:</b> -1 HP · комбо сброшено (осталось HP: ${g.hull})`, 'broken');
        }
        if (t.comboStreak >= 2) {
          sfx.combo(t.comboStreak);
        } else if (t.cells > 1) {
          sfx.cascade(t.cells);
        } else if (t.cells === 1 && !t.exploded) {
          sfx.click();
        }
        break;
      }
      case 'cleared':
        fx.banner(headerEl, 'ЦЕЛЬ ВЫПОЛНЕНА!\nСЕКТОР ПРОЙДЕН', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🎉 ЦЕЛЬ ВЫПОЛНЕНА!', '🏁 ПРОДОЛЖИТЬ ИЛИ НАБИВАТЬ OVERCHARGE!'], false);
        hud.log(`🏆 <b>Сектор пройден!</b> Цель (${g.target}) выполнена`, 'money');
        break;
      case 'overchargeUp':
        fx.banner(headerEl, `⚡ OVERCHARGE УР. ${e.level}!\n+$1 БОНУС`, 'bits');
        sfx.cascade(8);
        hud.showBonus([`⚡ OVERCHARGE УР. ${e.level}!`, `+$1 БОНУС ДЛЯ МАГАЗИНА`], false);
        hud.log(`⚡ <b>Overcharge Ур. ${e.level}:</b> +$1 к награде`, 'super');
        break;
      case 'fullClear':
        fx.banner(headerEl, `🏆 ПОЛНАЯ ЗАЧИСТКА!\n+$${e.bonusBits} БОНУС · +${e.bonusScore} PTS`, 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🏆 ПОЛНАЯ ЗАЧИСТКА СЕКТОРА!', `+$${e.bonusBits} BITS · +${e.bonusScore} PTS`], false);
        hud.log(`🏆 <b>Полная зачистка поля:</b> открыты все клетки и помечены все мины! Награда +$${e.bonusBits} Bits (+${e.bonusScore} PTS)`, 'super');
        hud.showClearedPopup();
        break;
      case 'blindClear':
        fx.banner(headerEl, `🕶️ ЗАЧИСТКА ВСЛЕПУЮ!\n+$${e.bonusBits} БОНУС · +${e.bonusScore} PTS`, 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🕶️ ЗАЧИСТКА ВСЛЕПУЮ!', `+$${e.bonusBits} BITS · +${e.bonusScore} PTS`], false);
        hud.log(`🕶️ <b>Зачистка вслепую:</b> все мины найдены в тумане войны! Награда +$${e.bonusBits} Bits (+${e.bonusScore} PTS)`, 'super');
        hud.showClearedPopup();
        break;
      case 'cheaterCaught':
        fx.banner(headerEl, `🕵️ ЖУЛИК ПОЙМАН!\nШТРАФ -${e.penalty} PTS`, 'hurt');
        sfx.boom();
        hud.showBonus(['🕵️ МЕТКА «ЖУЛИК»!', `-${e.penalty} PTS · ДЕБАФ «ПОЛОВИНА ФЛАГОВ»`], true);
        hud.log(`🕵️ <b>Жулик пойман:</b> попытка наугад накликать победу флагами! Штраф: -${e.penalty} очков. Дебаф «Половина флагов» на след. уровень`, 'broken');
        hud.showClearedPopup();
        break;
      case 'flagLimit':
        fx.banner(headerEl, `⚠️ ЛИМИТ ФЛАГОВ!\nМАКСИМУМ: ${g.maxFlags}`, 'hurt');
        sfx.boom();
        if (g.halfFlagsDebuff) {
          hud.showBonus(['⚠️ ЛИМИТ ФЛАГОВ!', `ДЕБАФ: ТОЛЬКО ${g.maxFlags} ФЛАГОВ`], true);
          hud.log(`⚠️ <b>Лимит исчерпан:</b> действует дебаф «Половина флагов» (макс. ${g.maxFlags} шт.)!`, 'broken');
        } else {
          hud.showBonus(['⚠️ ЛИМИТ ФЛАГОВ!', `МАКСИМУМ ${g.maxFlags} (ПО ЧИСЛУ МИН)`], true);
          hud.log(`⚠️ <b>Лимит флагов:</b> установлено ${g.maxFlags}/${g.maxFlags} шт. Больше флагов ставить нельзя!`, 'warning');
        }
        break;
      case 'stageCompletePending':
        hud.showClearedPopup();
        break;
      case 'fairyFound':
        fx.banner(headerEl, '🧚‍♀️ ФЕЯ В БАНКЕ НАЙДЕНА!\nВТОРОЕ ДЫХАНИЕ АКТИВНО', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🧚‍♀️ ФЕЯ В БАНКЕ!', 'ВТОРОЕ ДЫХАНИЕ АКТИВНО'], false);
        hud.log('🧚‍♀️ <b>Фея в банке найдена:</b> при гибели сектор перезапустится с полным HP, забег не сбросится!', 'super');
        break;
      case 'fairyRevived':
        fx.banner(headerEl, '🧚 ВТОРОЕ ДЫХАНИЕ!\nСЕКТОР ПЕРЕЗАПУЩЕН', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['🧚 ВТОРОЕ ДЫХАНИЕ!', 'ФЕЯ ИСПОЛЬЗОВАНА'], false);
        hud.log('🧚 <b>Фея спасла вас:</b> сектор перезапущен с полным HP!', 'super');
        break;
      case 'bossFairyReward':
        fx.banner(headerEl, '👑 БОСС 1 ПОВЕРЖЕН!\nНАГРАДА: 🧚 ФЕЯ В БАНКЕ', 'rainbow');
        sfx.jackpotFanfare();
        hud.showBonus(['👑 ТРОФЕЙ БОССА:', '🧚 ФЕЯ В БАНКЕ ПОЛУЧЕНА!'], false);
        hud.log('👑 <b>Победа над первым боссом:</b> в награду получена 🧚 <b>Фея в банке</b>! Второе дыхание активно.', 'super');
        break;
      case 'longMatch':
        fx.banner(headerEl, `🥢 ВЫТЯНУЛ ДЛИННУЮ СПИЧКУ!\n+$${e.bonusBits} БОНУС ЗА 50/50`, 'bits');
        sfx.jackpotFanfare();
        hud.showBonus(['🥢 ВЫТЯНУЛ ДЛИННУЮ СПИЧКУ!', `+$${e.bonusBits} BITS ЗА 50/50`], false);
        hud.log(`🥢 <b>Вытянул длинную спичку:</b> успешное угадывание в ситуации 50/50! Награда +$${e.bonusBits} Bits`, 'money');
        break;
      case 'frozenCellClicked':
        sfx.iceClink();
        fx.banner(headerEl, '🧊 ЯЧЕЙКА ЗАМОРОЖЕНА (нельзя открыть)', 'freeze');
        break;
      case 'roundEnd':
        hud.log(`🏁 <b>Сектор закрыт:</b> ${e.summary.score}/${e.summary.target} · Награда +$${e.summary.bits}`, 'money');
        fx.banner(headerEl, `+$${e.summary.bits}<small>${e.summary.score} / ${e.summary.target}</small>`, 'bits');
        setTimeout(() => {
          if (g === game) {
            hud.render();
            if (g.status === 'map') {
              sfx.relay();
              mapView.render();
            } else if (g.status === 'shop') {
              sfx.relay();
              shopView.render();
            }
          }
        }, 1100);
        break;
      case 'moduleFired':
        hud.flashModule(e.id);
        sfx.relay();
        break;
      case 'change':
        view.sync();
        hud.render();
        if (g.status === 'map') mapView.render();
        if (g.status === 'shop') shopView.render();
        break;
    }
  });
}

wire(game);
view.build(game.board);
updateModeUI();
hud.render();
shopView.render();
mapView.render();
