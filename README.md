# Sweeper: Overcharge

Roguelike-сапёр с билдостроением в духе Balatro. Web · Three.js · TypeScript.
- https://alexander-topilskii.github.io/minesweeperPro/ 

- 📄 Дизайн-документ: [docs/README.md](docs/README.md)

## Запуск

```bash
npm install
npm run dev      # dev-сервер
npm run build    # typecheck + production build в dist/
```

## Архитектура

```
src/
├── config.ts            баланс (очки, клики, мины, кривая целей)
├── core/
│   ├── board.ts         сетка: генерация, соседи, flood fill — без очков
│   ├── game.ts          состояние раунда, действия игрока, пайплайн хода
│   └── types.ts         TurnContext, ModuleDef, хуки (= триггеры из docs/glossary.md)
├── modules/registry.ts  реализации модулей (ID из docs/content/modules)
├── render/boardView.ts  Three.js: отрисовка поля, ввод (мышь / touch)
├── ui/hud.ts            DOM-HUD, слоты модулей, оверлеи
└── audio/sfx.ts         процедурный звук WebAudio
```

**Пайплайн хода:** `beginTurn` (Mult = 1 + комбо + roundMult) → `openSafe` / `hitMine` (хуки `onReveal`, `onCascade`, `onMineHit`) → `endTurn` (`Data × Mult × xMult`).

**Новый модуль:** добавить объект в `MODULES` с ID из документации и нужными хуками.

## Деплой

`.github/workflows/deploy.yml` собирает и публикует на GitHub Pages при push в `main`.
Один раз: **Settings → Pages → Source: GitHub Actions**.
