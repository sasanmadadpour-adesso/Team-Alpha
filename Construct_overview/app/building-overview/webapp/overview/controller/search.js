// Search for the overview tree (pure logic, no UI5 access; shared by the browser and the unit tests).
// Exact, case- and accent-insensitive substring matches come first. Only when nothing matches exactly,
// the single best fuzzy match (typo-tolerant) is returned.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(this, function () {
  "use strict";

  // Minimum similarity (0..1) a word must reach to count as a fuzzy match. Tune here.
  const FUZZY_THRESHOLD = 0.6;
  const MIN_FUZZY_LENGTH = 3;

  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Every value shown for a node, so a search finds what the user can see.
  function haystack(node) {
    const owner = [node.ownerName, [node.ownerFirstName, node.ownerLastName].filter(Boolean).join(" ")];
    const values = [node.displayName, node.malo, node.meLo, node.roleLabel, node.city, node.streetAddress,
      ...owner, node.switchoverStepLabel, node.totalConsumptionKwh, node.totalGenerationKwh, node.localEnergyKwh];
    return normalize(values.filter(value => value !== null && value !== undefined && value !== "").join(" | "));
  }

  function distance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  }

  function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    return longest ? 1 - distance(a, b) / longest : 1;
  }

  const words = text => text.split(/[^a-z0-9@.\-]+/).filter(Boolean);

  // Returns { mode: 'exact' | 'fuzzy' | 'none', ids } with ids in the order of `nodes`.
  function findMatches(nodes, query) {
    const needle = normalize(query);
    if (!needle) return { mode: "none", ids: [] };
    const exact = nodes.filter(node => haystack(node).includes(needle)).map(node => node.ID);
    if (exact.length) return { mode: "exact", ids: exact };
    if (needle.length < MIN_FUZZY_LENGTH) return { mode: "none", ids: [] };

    let best = null;
    for (const node of nodes) {
      const score = Math.max(0, ...words(haystack(node)).map(word => similarity(needle, word)));
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { id: node.ID, score };
    }
    return best ? { mode: "fuzzy", ids: [best.id], score: best.score } : { mode: "none", ids: [] };
  }

  return { FUZZY_THRESHOLD, normalize, haystack, similarity, findMatches };
});
