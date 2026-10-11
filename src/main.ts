import { Game } from './core/game';
import { getModule } from './modules/registry';
import { BoardView } from './render/boardView';
import { Hud } from './ui/hud';
import { ShopView } from './ui/shopView';
import { MapView } from './ui/mapView';
import { SlotMachineView } from './ui/slotMachineView';
import { Fx } from './ui/fx';
import { Sfx } from './audio/sfx';

/** Starter loadout: empty so the game starts vanilla without overwhelming the player. */
const STARTER: string[] = [];

const boardEl = document.getElementById('board')!;
const headerEl = (document.querySelector('.header') || boardEl) as HTMLElement;
const sfx = new Sfx();
const fx = new Fx();
let game = new Game(STARTER.map(getModule));

const view = new BoardView(boardEl, (x, y, action) => {
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
  wire(game);
  hud.setGame(game);
  shopView.setGame(game);
  mapView.setGame(game);
  slotMachine.setGame(game);
  view.build(game.board);
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
hud.render();
shopView.render();
mapView.render();
