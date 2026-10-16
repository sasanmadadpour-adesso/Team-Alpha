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
    const current = logic.parseHash(HashChanger.getInstance().getHash());
    const description = logic.describe(origin);
    const overviewDescription = logic.describeOverview(current);
    // A dynamic "back to where you came from" link plus a permanent "back to overview" link on
    // every sub-page; if the dynamic link already goes to the overview, only one link is shown.
    const showBack = Boolean(description) && !(origin && origin.type === "list");
    const showOverview = Boolean(overviewDescription);
    document.body.classList.toggle("vnbHasBackbar", showBack || showOverview);
    if (!showBack && !showOverview) { if (bar) bar.hidden = true; return; }
    if (!bar) {
      bar = document.createElement("nav");
      bar.className = "vnbBackbar";
      bar.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link) return;
        event.preventDefault();
        if (link.dataset.vnbOverview) { HashChanger.getInstance().setHash(""); return; }
        history.back();
      });
      document.body.prepend(bar);
    }
    const backLabel = showBack && description.arg ? text(description.key, [await title(origin)]) : showBack ? text(description.key) : null;
    // The state may have changed while the title was loading.
    if (!(history.state && history.state.vnbNav && history.state.from === origin)) return;
    bar.hidden = false;
    bar.innerHTML = "";
    if (showBack) {
      const link = document.createElement("a");
      link.href = `#${origin.hash}`;
      link.textContent = `\u2190 ${backLabel}`;
      bar.appendChild(link);
    }
    if (showOverview) {
      const link = document.createElement("a");
      link.href = "#";
      link.dataset.vnbOverview = "true";
      link.textContent = `\u2302 ${text(overviewDescription.key)}`;
      bar.appendChild(link);
    }
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
