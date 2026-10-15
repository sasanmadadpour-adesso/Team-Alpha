sap.ui.define(["sap/ui/core/routing/HashChanger", "./navLogic"], function (HashChanger, logic) {
  "use strict";

  // Remembers the page the user came from and shows a "back to" link.
  // The origin lives in the browser's per-entry history state, so it needs neither cookies nor storage
  // and survives reloads of the same history entry.
  const titles = new Map();
  let component = null;
  let bar = null;
  let previousHash = null;

  function bundle() {
    const model = component && component.getModel("i18n");
    return model && model.getResourceBundle();
  }

  function text(key, args) {
    const resources = bundle();
    return resources && typeof resources.getText === "function" ? resources.getText(key, args) : key;
  }

  // Constructs are shown by their primary MaLo instead of the long MeLo key.
  async function title(origin) {
    if (origin.type !== "construct") return origin.id;
    if (titles.has(origin.id)) return titles.get(origin.id);
    try {
      const response = await fetch(`/odata/v4/energy-overview/Constructs('${encodeURIComponent(origin.id)}')`);
      const value = response.ok ? (await response.json()).primaryMaLo : null;
      titles.set(origin.id, value || origin.id);
    } catch (error) { titles.set(origin.id, origin.id); }
    return titles.get(origin.id);
  }

  async function render() {
    const origin = history.state && history.state.vnbNav ? history.state.from : null;
    const description = logic.describe(origin);
    document.body.classList.toggle("vnbHasBackbar", Boolean(description));
    if (!description) { if (bar) bar.hidden = true; return; }
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "vnbBackbar";
      bar.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link) return;
        event.preventDefault();
        history.back();
      });
      document.body.prepend(bar);
    }
    const label = description.arg ? text(description.key, [await title(origin)]) : text(description.key);
    // The state may have changed while the title was loading.
    if (!(history.state && history.state.vnbNav && history.state.from === origin)) return;
    bar.hidden = false;
    bar.innerHTML = "";
    const link = document.createElement("a");
    link.href = `#${origin.hash}`;
    link.textContent = `\u2190 ${label}`;
    bar.appendChild(link);
  }

  function onHashChanged(event) {
    const next = logic.nextState(history.state, event.getParameter("oldHash") ?? previousHash, event.getParameter("newHash"));
    if (next !== history.state) history.replaceState(next, "");
    previousHash = event.getParameter("newHash");
    render();
  }

  return {
    // Called by every (re)created component; the latest one provides the texts.
    attach: function (owner) {
      component = owner;
      if (!this._started) {
        this._started = true;
        const changer = HashChanger.getInstance();
        previousHash = changer.getHash();
        if (!history.state || !history.state.vnbNav) history.replaceState(logic.nextState(history.state, null, previousHash), "");
        changer.attachEvent("hashChanged", onHashChanged);
      }
      render();
    },
    refresh: render
  };
});
