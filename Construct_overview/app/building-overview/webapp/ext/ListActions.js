sap.ui.define(["sap/base/i18n/Localization", "sap/ui/core/Component", "sap/ui/core/Element"], function (Localization, Component, Element) {
  "use strict";

  const COMPONENT_NAME = "vnb.constructs";

  // Switches DE/EN in place: sets the UI5 language and recreates the component at the current hash,
  // so texts, labels and the language-dependent OData responses are reloaded without a page reload.
  async function toggleLanguage() {
    const next = Localization.getLanguage().toLowerCase().startsWith("de") ? "en" : "de";
    Localization.setLanguage(next);
    document.documentElement.lang = next;
    const url = new URL(window.location.href);
    url.searchParams.set("sap-language", next.toUpperCase());
    // Keeps the language on a manual reload; the history state and the hash stay untouched.
    window.history.replaceState(window.history.state, "", url);

    const container = Element.getElementById("container");
    const previous = Component.getComponentById(container.getComponent());
    const created = await Component.create({ name: COMPONENT_NAME });
    container.setComponent(created);
    previous?.destroy();
  }

  return { toggleLanguage };
});
