/** RS3 profit from crafting masterwork ranged armour out of buyable intermediates. */
import { defineProfitScript, item } from "./lib/profit.js";

const MONOCHROMATIC = item("Masterwork monochromatic dragon leather", 60532);
const ELASTICATED = item("Masterwork elasticated leather", 60529);
const CHROMATIC = item("Masterwork chromatic dragon leather", 60535);
const SINEW = item("Masterwork sinew", 60537);
const ALGARUM_THREAD = item("Algarum thread", 29864);

// One ethereal draconic plate = masterwork ranged plate + 10 draconic shards + 10 lacquer
// + 10 apex leather. Lacquer is a port trade good (not on the GE) and is left out.
const GLORIOUS_BAR = item("Glorious bar", 45991);
const PRAESULIC_RANGED = item("Praesulic essence (ranged)", 50347);
const SIRENIC_ESSENCE = item("Sirenic essence", 60807);
const DRACONIC_SHARDS = item("Draconic shards", 60538);
const APEX_LEATHER = item("Apex leather", 60778);
const PLATE = [
  [GLORIOUS_BAR, 1],
  [PRAESULIC_RANGED, 1],
  [SIRENIC_ESSENCE, 1],
  [DRACONIC_SHARDS, 10],
  [APEX_LEATHER, 10],
];

// [output, tailoring minutes, plates, monochromatic, elasticated, chromatic, sinew]
const PIECES = [
  [item("Masterwork ranged cowl", 60565), 60, 2, 3, 2, 1, 200],
  [item("Masterwork ranged body", 60583), 100, 5, 10, 3, 0, 500],
  [item("Masterwork ranged chaps", 60572), 60, 3, 5, 2, 0, 300],
  [item("Masterwork ranged vambraces", 60558), 50, 1, 1, 1, 0, 100],
  [item("Masterwork ranged boots", 60551), 50, 1, 1, 1, 0, 100],
];

const recipes = PIECES.map(([output, minutes, plates, mono, elast, chroma, sinew]) => ({
  output,
  hours: minutes / 60,
  inputs: [
    [MONOCHROMATIC, mono],
    [ELASTICATED, elast],
    ...(chroma ? [[CHROMATIC, chroma]] : []),
    [SINEW, sinew],
    [ALGARUM_THREAD, 1],
    ...PLATE.map(([it, qty]) => [it, qty * plates]),
  ],
}));

const script = defineProfitScript({
  meta: {
    id: "masterwork-ranged-profit",
    title: "Masterwork ranged armour",
    description: "Buy leather, sinew and plate materials, craft masterwork ranged armour, sell on the Grand Exchange.",
    notes: [
      "Prices: Grand Exchange guide prices (exact, via the Weird Gloop API)",
      "Time is tailoring only (drafting table + tailor's dummy at default speed)",
      "Lacquer (10 per plate) is not on the GE and is excluded; plate smithing/imbuing time not included",
    ],
  },
  sections: [{ title: "Masterwork ranged armour", recipes }],
});

export const { meta, requiredItems, calculate } = script;
