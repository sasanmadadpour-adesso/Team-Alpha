sap.ui.define(["sap/ui/core/UIComponent"], function (UIComponent) {
  "use strict";

  // Standalone nested component hosting the combined construct/building tree (one table,
  // no list-report tabs). It is addressed as a plain router target ("type": "Component"),
  // the same mechanism the Fiori Elements list/object pages already use.
  return UIComponent.extend("vnb.constructs.overview.Component", {
    metadata: { manifest: "json" }
  });
});
