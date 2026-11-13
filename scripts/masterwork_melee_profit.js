/** RS3 profit from buying glorious bars and smithing masterwork melee armour. */
import { defineProfitScript, formatDuration, item } from "./lib/profit.js";

const GLORIOUS_BAR = item("Glorious bar", 45991);
const STEEL_BAR = item("Steel bar", 2353);
const LEATHER = item("Leather", 1741);
const TRIM = item("Masterwork melee armour trim", 46036);

// Smithing minutes from a glorious bar (RuneScape Wiki, Masterwork melee equipment):
// 31 min per bar (plate, curved plate, untempered piece, armour piece) + riveting
// (10 rivets per bar, 5 ticks each) + final assembly ticks. Folding bars, smelting
// rivets and applying trims are not counted.
// [normal, trimmed, bars, smithing minutes]
const PIECES = [
  [item("Masterwork melee helm", 45955), item("Trimmed masterwork melee helm", 46038), 2, 63.15],
  [item("Masterwork melee platebody", 45970), item("Trimmed masterwork melee platebody", 46053), 5, 157.75],
  [item("Masterwork melee platelegs", 45975), item("Trimmed masterwork melee platelegs", 46058), 3, 94.65],
  [item("Masterwork melee gloves", 45960), item("Trimmed masterwork melee gloves", 46043), 1, 31.55],
  [item("Masterwork melee boots", 45965), item("Trimmed masterwork melee boots", 46048), 1, 31.55],
];

const recipe = (output, bars, minutes, trimmed) => ({
  output,
  hours: minutes / 60,
  detail: `${bars} bar${bars > 1 ? "s" : ""} · ${formatDuration(minutes / 60)}`,
  inputs: [
    [GLORIOUS_BAR, bars],
    [STEEL_BAR, bars],
    [LEATHER, bars],
    ...(trimmed ? [[TRIM, bars]] : []),
  ],
});

const script = defineProfitScript({
  meta: {
    id: "masterwork-melee-profit",
    title: "Masterwork melee armour",
    description: "Buy glorious bars, smith masterwork melee armour, sell on the Grand Exchange.",
    notes: [
      "Prices: Grand Exchange guide prices (exact, via the Weird Gloop API)",
      "Time is smithing from glorious bar to finished piece (31 min per bar + riveting + assembly)",
      "Folding bars, smelting rivets and applying trims are not included",
    ],
  },
  sections: [
    {
      title: "Normal masterwork",
      recipes: PIECES.map(([normal, , bars, minutes]) => recipe(normal, bars, minutes, false)),
    },
    {
      title: "Trimmed masterwork",
      recipes: PIECES.map(([, trimmed, bars, minutes]) => recipe(trimmed, bars, minutes, true)),
    },
  ],
});

export const { meta, requiredItems, calculate } = script;
