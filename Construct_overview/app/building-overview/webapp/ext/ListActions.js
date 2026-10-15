sap.ui.define(["sap/m/MessageBox"], function (MessageBox) {
  "use strict";
  return { showLanguageHint: function () { MessageBox.information("Die Sprache folgt Ihrer Browser- bzw. SAPUI5-Spracheinstellung. Ergänzen Sie ?sap-language=EN oder ?sap-language=DE zur URL.\n\nThe language follows your browser or SAPUI5 language setting. Add ?sap-language=EN or ?sap-language=DE to the URL.", { title: "DE / EN" }); } };
});
