// Registry of scripts shown as cards on the web page.
// To add one: create a module exporting `meta`, `fetchPrices(urlFor)` and `calculate(prices)`
// (see lib/profit.js `defineProfitScript`), then add it to this list.
import * as masterworkMeleeProfit from "./masterwork_melee_profit.js";
import * as masterworkRangedProfit from "./masterwork_ranged_profit.js";
import * as masterworkMagicProfit from "./masterwork_magic_profit.js";
import * as runeShopProfit from "./rune_shop_profit.js";

export const scripts = [masterworkMeleeProfit, masterworkRangedProfit, masterworkMagicProfit, runeShopProfit];
