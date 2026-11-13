import { scripts } from "/scripts/index.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ICONS = {
  "masterwork-melee-profit": "⚔️",
  "masterwork-ranged-profit": "🏹",
  "masterwork-magic-profit": "🪄",
  "rune-shop-profit": "🔮",
};

document.getElementById("cards").innerHTML = scripts.map((s) => `
  <a class="card link" href="script.html?id=${encodeURIComponent(s.meta.id)}">
    <span class="card-icon" aria-hidden="true">${ICONS[s.meta.id] ?? "🪙"}</span>
    <h2>${esc(s.meta.title)}</h2>
    <p class="desc">${esc(s.meta.description)}</p>
    <span class="open">View profits <span aria-hidden="true">→</span></span>
  </a>`).join("");
