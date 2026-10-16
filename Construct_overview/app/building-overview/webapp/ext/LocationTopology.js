sap.ui.define(["sap/ui/core/Control"], function (Control) {
  "use strict";

  const ODATA = "/odata/v4/energy-overview";

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  const href = id => `#/Constructs('${encodeURIComponent(id)}')`;

  // Shows how a participant hangs on the building's shared energy counter and the grid:
  // own MeLo / MaLo -> shared counter (MaLo, plus MeLo when the counter is real) -> grid.
  const LocationTopology = Control.extend("vnb.constructs.ext.LocationTopology", {
    metadata: {},
    init: function () {
      Control.prototype.init.apply(this, arguments);
      this._onModelContextChange = this._onModelContextChange.bind(this);
      this.attachModelContextChange(this._onModelContextChange);
    },
    renderer: {
      apiVersion: 2,
      render: function (rm, control) {
        rm.openStart("section", control).class("vnbLtRoot").openEnd();
        rm.openStart("div").attr("id", `${control.getId()}-body`).class("vnbLt").openEnd();
        rm.close("div");
        rm.close("section");
      }
    },
    onAfterRendering: function () {
      this._body = document.getElementById(`${this.getId()}-body`);
      this._loadedID = null;
      this.load();
    },
    _onModelContextChange: function () {
      this._loadedID = null;
      if (this.getDomRef()) this.load();
    },
    exit: function () {
      this.detachModelContextChange(this._onModelContextChange);
      this._requestController?.abort();
    },
    _text: function (key, args) {
      const bundle = this.getModel("i18n")?.getResourceBundle();
      return bundle ? bundle.getText(key, args) : key;
    },
    load: async function () {
      const context = this.getBindingContext();
      if (!this._body) return;
      // Object page sections are bound lazily when they scroll into view.
      if (!context) { this._body.innerHTML = `<p class="vnbLt-note">${escape(this._text("trendLoading"))}</p>`; return; }
      const id = context.getProperty("ID");
      if (!id || this._loadedID === id) return;
      this._loadedID = id;
      this._requestController?.abort();
      this._requestController = new AbortController();
      try {
        const response = await fetch(`${ODATA}/Constructs('${encodeURIComponent(id)}')`, { signal: this._requestController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this._body.innerHTML = this._template(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") this._body.innerHTML = `<p class="vnbLt-note">${escape(this._text("trendUnavailable", [error.message]))}</p>`;
      }
    },
    _row: function (labelKey, value, extra) {
      return value ? `<div class="vnbLt-row"><span>${escape(this._text(labelKey))}</span><b class="vnbLt-id">${escape(value)}</b>${extra || ""}</div>` : "";
    },
    _template: function (c) {
      const t = key => escape(this._text(key));
      const roles = { HOUSEHOLD: "roleHousehold", GENERATION: "rolePlant", BIDIRECTIONAL: "rolePlant", RESIDUAL: "roleCounter" };
       const participant = `
         <section class="vnbLt-card vnbLt-own">
           <h4>${t(roles[c.roleCode] || "roleHousehold")}</h4>
           ${this._row("importMaLoLabel", c.importMaLo)}
           ${this._row("exportMaLoLabel", c.exportMaLo)}
           ${this._row("meLoLabel", c.meLo)}
         </section>`;
      const wire = `<div class="vnbLt-wire" aria-hidden="true"></div>`;
      const grid = `<section class="vnbLt-card vnbLt-grid"><h4>${t("gridNode")}</h4><p>${t("gridNodeHint")}</p></section>`;

      if (c.isSharedMeter) {
        const members = `<p>${escape(c.buildingMemberCount)} ${t("householdMembers")}</p>`;
        const building = c.buildingLink ? `<a class="vnbLt-link" href="${escape(c.buildingLink)}">${escape(this._text("openBuilding", [c.buildingID]))}</a>` : "";
        return `<div class="vnbLt-flow"><section class="vnbLt-card vnbLt-counter"><h4>${t("roleCounter")}</h4>${this._row("sharedMaLoLabel", c.sharedMeterMaLo)}${c.sharedMeterIsReal ? this._row("meLoLabel", c.sharedMeterMeLo) : ""}${members}${building}</section>${wire}${grid}</div>`;
      }
      if (!c.sharedMeterMaLo) {
        return `<div class="vnbLt-flow">${participant}${wire}${grid}</div><p class="vnbLt-note">${t("noSharedMeter")}</p>`;
      }
      const link = c.sharedMeterConstructID ? `<a class="vnbLt-link" href="${escape(href(c.sharedMeterConstructID))}">${t("openCounter")}</a>` : "";
      const counter = `
        <section class="vnbLt-card vnbLt-counter">
          <h4>${t("sharedCounter")}</h4>
          ${this._row("sharedMaLoLabel", c.sharedMeterMaLo)}
          ${c.sharedMeterIsReal ? this._row("sharedMeLoLabel", c.sharedMeterMeLo) : ""}
          ${link}
        </section>`;
      return `<div class="vnbLt-flow">${participant}${wire}${counter}${wire}${grid}</div>`;
    }
  });
  return LocationTopology;
});
