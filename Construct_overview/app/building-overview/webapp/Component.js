sap.ui.define([
  "sap/fe/core/AppComponent",
  "sap/ui/mdc/table/ResponsiveTableType",
  "./ext/NavHistory"
], function (AppComponent, ResponsiveTableType, NavHistory) {
  "use strict";

  // Tables start with "Show More per Row" switched on, so every column is visible under each row.
  // The SAPUI5 table has no public setting for the initial state; if the private hook is missing
  // (e.g. after a UI5 upgrade) the tables simply fall back to their normal collapsed start.
  if (!ResponsiveTableType.prototype._vnbShowDetailsPatched && typeof ResponsiveTableType.prototype._getShowDetailsButton === "function") {
    const original = ResponsiveTableType.prototype._getShowDetailsButton;
    ResponsiveTableType.prototype._getShowDetailsButton = function () {
      const isNew = !this._oShowDetailsButton;
      const button = original.apply(this, arguments);
      if (isNew && typeof this._setShowDetailsState === "function") {
        // Runs after the table has applied its initial hidden-in-popin columns.
        Promise.resolve().then(() => { if (!this.bIsDestroyed) this._setShowDetailsState(true, true); });
      }
      return button;
    };
    ResponsiveTableType.prototype._vnbShowDetailsPatched = true;
  }

  return AppComponent.extend("vnb.constructs.Component", {
    metadata: { manifest: "json" },
    init: function () {
      AppComponent.prototype.init.apply(this, arguments);
      NavHistory.attach(this);
    }
  });
});
