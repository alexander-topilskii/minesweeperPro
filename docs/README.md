# Sweeper: Overcharge — Документация

Точка входа в дизайн-документацию. Каждый раздел — отдельный файл, контентные каталоги (модули, расходники, боссы) разбиты по категориям, чтобы их можно было расширять независимо.

## Структура

```
docs/
├── README.md                  ← вы здесь
├── SYSTEMS.md                 ← 🌳 Мастер-документ: полное дерево всех игровых систем и архитектуры
├── glossary.md                ← термины и триггеры (общий словарь для дизайна и кода)
├── open-questions.md          ← нерешённые вопросы и противоречия
├── gdd/
│   ├── 01-concept.md          ← High Concept, Core Pillars
│   ├── 02-core-loop.md        ← цикл забега, сектора, этапы
│   ├── 03-scoring.md          ← формула очков, ресурсы
│   ├── 04-field.md            ← поле и управление
│   └── 08-audiovisual.md      ← стиль, звук, game juice
├── content/
│   ├── modules/
│   │   ├── README.md          ← правила модулей, индекс категорий
│   │   ├── 01-value.md
│   │   ├── 02-scaling.md
│   │   ├── 03-rule-breakers.md
│   │   ├── 04-hazard.md
│   │   ├── 05-economy.md
│   │   └── 06-legendary.md
│   ├── consumables.md
│   └── bosses.md
└── templates/
    ├── module.md              ← шаблон нового модуля
    ├── consumable.md
    └── boss.md
```

## Разделы GDD

1. [Концепция](gdd/01-concept.md)
2. [Игровой цикл](gdd/02-core-loop.md)
3. [Очки и ресурсы](gdd/03-scoring.md)
4. [Поле и управление](gdd/04-field.md)
5. [Модули (джокеры)](content/modules/README.md)
6. [Расходники](content/consumables.md)
7. [Боссы / Аномалии](content/bosses.md)
8. [Аудиовизуальный стиль](gdd/08-audiovisual.md)

## Конвенции

- **ID контента** — стабильные, не переиспользуются: `MOD-<CAT>-NN`, `CON-NN`, `BOSS-NN`. Эти же ID использовать в коде (`src/content/...`).
- **Триггеры** — только из [glossary.md](glossary.md#триггеры). Новый триггер → сначала добавить в глоссарий.
- **Добавление контента** — скопировать шаблон из `templates/`, добавить строку в таблицу нужной категории.
- **Противоречия и TBD** — фиксировать в [open-questions.md](open-questions.md), а не в тексте разделов.
