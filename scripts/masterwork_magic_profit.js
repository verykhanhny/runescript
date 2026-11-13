/** RS3 profit from crafting masterwork magic armour out of buyable intermediates. */
import { defineProfitScript, item } from "./lib/profit.js";

const WHITE_CLOTH = item("Masterwork white cloth", 59075);
const BLUE_CLOTH = item("Masterwork blue cloth", 59078);
const GREEN_CLOTH = item("Masterwork green cloth", 59081);
const THREAD = item("Masterwork thread", 59083);
const STONE_OF_BINDING = item("Stone of binding", 28628);

// One ethereal pearlescent plate = pearlescent substrate (tectonic essence + praesulic essence
// + 5 pearls) + 10 platinum bars + dyed undead dragon leather (undead dragon leather + brown dye).
// Pearls are not on the GE and are left out.
const TECTONIC_ESSENCE = item("Tectonic essence", 59212);
const PRAESULIC_MAGIC = item("Praesulic essence (magic)", 50345);
const PLATINUM_BAR = item("Platinum bar", 59210);
const UNDEAD_LEATHER = item("Undead dragon leather", 56075);
const BROWN_DYE = item("Brown dye", 57170);
const PLATE = [
  [TECTONIC_ESSENCE, 1],
  [PRAESULIC_MAGIC, 1],
  [PLATINUM_BAR, 10],
  [UNDEAD_LEATHER, 1],
  [BROWN_DYE, 1],
];

// [output, tailoring minutes, plates, white, blue, green, thread]
const PIECES = [
  [item("Masterwork magic hat", 59104), 60, 2, 3, 2, 1, 200],
  [item("Masterwork magic robe top", 59114), 100, 5, 10, 3, 0, 500],
  [item("Masterwork magic robe bottom", 59108), 60, 3, 5, 2, 0, 300],
  [item("Masterwork magic gloves", 59100), 50, 1, 1, 1, 0, 100],
  [item("Masterwork magic boots", 59096), 50, 1, 1, 1, 0, 100],
];

const recipes = PIECES.map(([output, minutes, plates, white, blue, green, thread]) => ({
  output,
  hours: minutes / 60,
  inputs: [
    [WHITE_CLOTH, white],
    [BLUE_CLOTH, blue],
    ...(green ? [[GREEN_CLOTH, green]] : []),
    [THREAD, thread],
    [STONE_OF_BINDING, 1],
    ...PLATE.map(([it, qty]) => [it, qty * plates]),
  ],
}));

const script = defineProfitScript({
  meta: {
    id: "masterwork-magic-profit",
    title: "Masterwork magic armour",
    description: "Buy cloth, thread and plate materials, craft masterwork magic armour, sell on the Grand Exchange.",
    notes: [
      "Prices: Grand Exchange guide prices (exact, via the Weird Gloop API)",
      "Time is tailoring only (drafting table + tailor's dummy at default speed)",
      "Pearls (5 per plate) are not on the GE and are excluded; plate smithing/imbuing time not included",
    ],
  },
  sections: [{ title: "Masterwork magic armour", recipes }],
});

export const { meta, requiredItems, calculate } = script;
