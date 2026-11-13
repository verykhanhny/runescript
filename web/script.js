import { scripts } from "/scripts/index.js";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const gp = (n) => `${nf.format(n)} gp`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const signed = (n) => `<span class="${n >= 0 ? "pos" : "neg"}">${gp(n)}</span>`;

function renderShops(shops) {
  const items = shops.map((s) => `<li><span>${esc(s.name)}</span><span>${nf.format(s.stock)}</span></li>`).join("");
  return `<details class="shops"><summary>${shops.length} shop${shops.length > 1 ? "s" : ""}</summary><ul>${items}</ul></details>`;
}

function renderChecklist(section, scriptId) {
  const keyOf = (shop) => `run:${scriptId}:${shop.id}`;
  const get = (key) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
  const shops = section.checklist.map((shop) => `
    <li class="run-shop">
      <label>
        <input type="checkbox" data-key="${esc(keyOf(shop))}" ${get(keyOf(shop)) ? "checked" : ""}>
        <span class="run-title">${esc(shop.title)}</span>
        <span class="run-total">${signed(shop.total)}</span>
      </label>
      <ul class="run-items">${shop.items.map((i) =>
        `<li><span>${esc(i.label)}</span><span class="meta">${nf.format(i.qty)} × · ${gp(i.profit)}</span></li>`).join("")}</ul>
    </li>`).join("");
  return `
    <h3>${esc(section.title)}</h3>
    ${section.legend ? `<p class="meta legend">${esc(section.legend)}</p>` : ""}
    <ul class="run">${shops}</ul>
    <button type="button" class="reset-run">Reset ticks</button>`;
}

function renderSection(section) {
  if (section.checklist) return renderChecklist(section, id);
  const hourly = section.rows.some((r) => r.hourlyProfit != null);
  const best = section.rows[0]?.hourlyProfit;
  const rows = section.rows.map((r) => `
    <tr class="${[r.status ? `status-${r.status}` : "", hourly && r.hourlyProfit === best ? "best" : ""].join(" ")}">
      <td>${esc(r.name)}<div class="meta">${esc(r.detail)}</div>${r.shops ? renderShops(r.shops) : ""}</td>
      <td>
        <div>${gp(r.cost)}</div>
        <ul class="inputs">${r.inputs.map((i) => `<li>${i.qty} × ${esc(i.name)} @ ${nf.format(i.unit)}</li>`).join("")}</ul>
      </td>
      <td>
        <div>${gp(r.net)}</div>
        <div class="meta">${nf.format(r.price)} − ${nf.format(r.tax)} tax</div>
      </td>
      <td>${signed(r.profit)}</td>
      ${hourly ? `<td>${signed(r.hourlyProfit)}</td>` : ""}
      <td>${(r.roi * 100).toFixed(2)}%</td>
    </tr>`).join("");
  return `
    <h3>${esc(section.title)}</h3>
    ${section.summary ? `<p class="summary">${esc(section.summary.label)}: ${signed(section.summary.value)}</p>` : ""}
    ${section.legend ? `<p class="meta legend">${section.legend}</p>` : ""}
    <div class="scroll"><table>
      <thead><tr><th>Item</th><th>Input</th><th>Output (after tax)</th><th>Profit</th>${hourly ? "<th>Profit / hr</th>" : ""}<th>ROI</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

const id = new URLSearchParams(location.search).get("id");

function wireChecklist() {
  for (const box of body.querySelectorAll("input[data-key]")) {
    box.closest(".run-shop").classList.toggle("done", box.checked);
    box.addEventListener("change", () => {
      try { localStorage.setItem(box.dataset.key, box.checked ? "1" : "0"); } catch {}
      box.closest(".run-shop").classList.toggle("done", box.checked);
    });
  }
  body.querySelector(".reset-run")?.addEventListener("click", () => {
    for (const box of body.querySelectorAll("input[data-key]")) {
      box.checked = false;
      box.dispatchEvent(new Event("change"));
    }
  });
}
const script = scripts.find((s) => s.meta.id === id);
const body = document.getElementById("body");
const foot = document.getElementById("foot");
const button = document.getElementById("refresh");

if (!script) {
  document.getElementById("title").textContent = "Script not found";
  body.innerHTML = '<p class="error">No script with that id.</p>';
  button.hidden = true;
} else {
  document.title = `${script.meta.title} · RuneScape Scripts`;
  document.getElementById("title").textContent = script.meta.title;
  document.getElementById("desc").textContent = script.meta.description;

  async function load() {
    button.disabled = true;
    body.innerHTML = '<p class="meta">Loading prices…</p>';
    try {
      const prices = await script.fetchPrices((itemId) => `/api/price/${itemId}`);
      const result = script.calculate(prices);
      body.innerHTML = result.sections.map(renderSection).join("");
      wireChecklist();
      foot.textContent = [...script.meta.notes, `GE tax ${(result.settings.geTax * 100).toFixed(0)}%`,
        `Updated ${new Date().toLocaleTimeString()}`].join(" · ");
    } catch (error) {
      body.innerHTML = `<p class="error">Could not load prices: ${esc(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", load);
  load();
}
