// Pure navigation-history logic (no UI5 or DOM access), shared by the browser and the unit tests.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(this, function () {
  "use strict";

  const normalize = hash => {
    let value = String(hash || "").replace(/^#/, "");
    try { value = decodeURIComponent(value); } catch (error) { /* keep raw value */ }
    return value.replace(/^\/+/, "");
  };

  // Maps a router hash to the kind of page it shows.
  function parseHash(hash) {
    const value = normalize(hash);
    const entity = /^(Constructs|Buildings)\('([^']+)'\)/.exec(value);
    if (entity) return { type: entity[1] === "Buildings" ? "building" : "construct", id: entity[2] };
    return { type: "list", id: null };
  }

  // Decides the history state for the entry the user just arrived at.
  // An entry that already carries our marker (reload, back/forward) keeps its stored origin.
  function nextState(state, oldHash, newHash) {
    if (state && state.vnbNav) return state;
    // `null`/`undefined` means there was no previous page; an empty hash is the list page.
    const known = oldHash !== null && oldHash !== undefined;
    const origin = known && normalize(oldHash) !== normalize(newHash) ? { hash: String(oldHash).replace(/^#/, ""), ...parseHash(oldHash) } : null;
    return { ...(state || {}), vnbNav: true, from: origin };
  }

  // Key of the i18n text and its argument for a back link label.
  function describe(origin) {
    if (!origin) return null;
    if (origin.type === "building") return { key: "backToBuilding", arg: origin.id };
    if (origin.type === "construct") return { key: "backToConstruct", arg: origin.id };
    return { key: "backToList", arg: null };
  }

  // A second, permanent link back to the index overview page, shown on every sub-page
  // (building or construct) regardless of how the user got there.
  function describeOverview(current) {
    if (!current || current.type === "list") return null;
    return { key: "backToOverview", arg: null };
  }

  return { normalize, parseHash, nextState, describe, describeOverview };
});
