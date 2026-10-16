// Pure formatters for the overview tree table (no UI5 state; loaded by the browser and by the unit tests).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
})(this, function () {
  "use strict";

  const NODE_ICONS = { BUILDING: "sap-icon://building", HOUSEHOLD: "sap-icon://home", PRODUCER: "sap-icon://solar-panel", COUNTER: "sap-icon://gauge" };

  return {
    isHousehold: nodeType => nodeType === "HOUSEHOLD",
    hasLink: detailHash => Boolean(detailHash),
    nodeIcon: nodeType => NODE_ICONS[nodeType] || "sap-icon://connected",
    nodeIconClass: nodeType => `vnbOv-icon vnbOv-icon-${String(nodeType || "").toLowerCase()}`,

    // MK7 state: 1 = not participating (red), 2 = participating, energy concept unfinished (yellow), 3 = finished (green).
    mk7Icon: criticality => (criticality === 1 ? "sap-icon://error" : criticality === 2 ? "sap-icon://alert" : "sap-icon://accept"),
    mk7Class: criticality => (criticality === 1 ? "vnbOv-mk7 vnbOv-mk7-no" : criticality === 2 ? "vnbOv-mk7 vnbOv-mk7-warn" : "vnbOv-mk7 vnbOv-mk7-yes"),

    // Step name and progress bar are only shown while a household is below the last step.
    statusDetail: (nodeType, step, total) => nodeType === "HOUSEHOLD" && Number(step) > 0 && Number(step) < Number(total || 8),
    progressPercent: (step, total) => (Number(total) ? Math.round((Number(step) || 0) / Number(total) * 100) : 0),

    // Row marking for search: current match (strong) and other matches (light).
    rowHighlight: (id, matchIds, currentId) => (!id || !Array.isArray(matchIds) || !matchIds.includes(id) ? "None" : id === currentId ? "Warning" : "Information")
  };
});
