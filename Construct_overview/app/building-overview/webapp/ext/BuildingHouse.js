sap.ui.define(["sap/ui/core/Control"], function (Control) {
  "use strict";

  const ODATA = "/odata/v4/energy-overview";

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  const formatKwh = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const constructHref = id => `#/Constructs('${encodeURIComponent(id)}')`;

  // Renders a MaLo as a link to its construct detail page when it belongs to a construct, otherwise as plain text.
  function malo(value, targetConstructID, extraClass) {
    const className = `vnbBh-malo ${extraClass || ""}`.trim();
    return targetConstructID
      ? `<a class="${className} vnbBh-link" href="${escape(constructHref(targetConstructID))}">${escape(value)}</a>`
      : `<span class="${className}">${escape(value)}</span>`;
  }

  const BuildingHouse = Control.extend("vnb.constructs.ext.BuildingHouse", {
    metadata: {},
    init: function () {
      Control.prototype.init.apply(this, arguments);
      this._onModelContextChange = this._onModelContextChange.bind(this);
      this.attachModelContextChange(this._onModelContextChange);
    },
    renderer: {
      apiVersion: 2,
      render: function (rm, control) {
        rm.openStart("section", control).class("vnbBhRoot").openEnd();
        rm.openStart("div").attr("id", `${control.getId()}-body`).class("vnbBh").openEnd();
        rm.close("div");
        rm.close("section");
      }
    },
    onAfterRendering: function () {
      this._body = document.getElementById(`${this.getId()}-body`);
      this.load();
    },
    _onModelContextChange: function () {
      this._loadedID = null;
      if (this.getDomRef()) this.load();
    },
    exit: function () {
      this.detachModelContextChange(this._onModelContextChange);
      this._requestController?.abort();
      this._requestController = null;
    },
    _text: function (key, args) {
      const bundle = this.getModel("i18n")?.getResourceBundle();
      return bundle ? bundle.getText(key, args) : key;
    },
    _get: function (path, signal) {
      return fetch(`${ODATA}/${path}`, { signal }).then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    },
    load: async function () {
      const context = this.getBindingContext();
      if (!this._body) return;
      // Object page sections are bound lazily when they scroll into view; wait for the context instead of failing.
      if (!context) { this._body.innerHTML = `<p class="vnbBh-note">${escape(this._text("trendLoading"))}</p>`; return; }
      const id = context.getProperty("ID");
      if (!id || this._loadedID === id) return;
      this._loadedID = id;
      this._requestController?.abort();
      this._requestController = new AbortController();
      const signal = this._requestController.signal;
      const key = `Buildings('${encodeURIComponent(id)}')`;
      this._body.innerHTML = `<p class="vnbBh-note">${escape(this._text("trendLoading"))}</p>`;
      try {
        const [building, consumers, solar, wind] = await Promise.all([
          this._get(key, signal),
          this._get(`${key}/consumers`, signal),
          this._get(`${key}/solarProducers`, signal),
          this._get(`${key}/windProducers`, signal)
        ]);
        this._body.innerHTML = this._template(building, consumers.value || [], solar.value || [], wind.value || []);
      } catch (error) {
        if (error.name !== "AbortError") this._body.innerHTML = `<p class="vnbBh-note">${escape(this._text("trendUnavailable", [error.message]))}</p>`;
      }
    },
    _template: function (building, consumers, solarProducers, windProducers) {
      const t = key => escape(this._text(key));
      const hasSolar = Boolean(building.hasSolar);
      const hasWind = Boolean(building.hasWind);
      const statusKey = hasSolar && hasWind ? "solarWindActive" : hasSolar ? "solarActive" : hasWind ? "windActive" : "noProduction";

      const floors = consumers.map((consumer, index) => {
        const linked = Boolean(consumer.targetConstructID);
        return `<div class="vnbBh-floor"><span class="vnbBh-floor-number">${t("floorLabel")} ${String(index + 1).padStart(2, "0")}</span>${malo(consumer.importMaLo, consumer.targetConstructID)}<span class="vnbBh-state">${linked ? t("detailLink") : t("memberLabel")}</span></div>`;
      }).join("") || `<p class="vnbBh-note">${t("noMembers")}</p>`;

      const members = (rows, emptyText) => rows.length
        ? rows.map(row => `<div class="vnbBh-source-member">${malo(row.marketLocationIdentifier, row.targetConstructID)}</div>`).join("")
        : `<p class="vnbBh-note">${escape(emptyText)}</p>`;

      const wire = (visible, className, value) => visible
        ? `<div class="vnbBh-wire ${className}"><span class="vnbBh-wire-label">${escape(formatKwh(value))} kWh</span></div>`
        : "";

      const solarSource = hasSolar ? `
        <section class="vnbBh-source vnbBh-solar">
          <div class="vnbBh-panel" aria-hidden="true"></div>
          <h4>${t("solarProducers")}</h4>
          <p>${escape(building.solarProducerCount)} ${t("producers")} · ${escape(formatKwh(building.averageSolarGeneration24hKwh))} kWh</p>
          <div class="vnbBh-source-members">${members(solarProducers, this._text("noMembers"))}</div>
        </section>` : "";

      const windSource = hasWind ? `
        <section class="vnbBh-source vnbBh-wind">
          <div class="vnbBh-turbine" aria-hidden="true"><i class="vnbBh-tower"></i><i class="vnbBh-hub"></i><i class="vnbBh-blade one"></i><i class="vnbBh-blade two"></i><i class="vnbBh-blade three"></i></div>
          <h4>${t("windProducers")}</h4>
          <p>${escape(building.windProducerCount)} ${t("producers")} · ${escape(formatKwh(building.averageWindGeneration24hKwh))} kWh</p>
          <div class="vnbBh-source-members">${members(windProducers, this._text("noMembers"))}</div>
        </section>` : "";

      const legend = [
        hasSolar ? `<span class="vnbBh-key vnbBh-key-solar"><i></i>${t("solarGeneration")}</span>` : "",
        hasWind ? `<span class="vnbBh-key vnbBh-key-wind"><i></i>${t("windGeneration")}</span>` : "",
        `<span>${t("underlinedDetail")}</span>`,
        `<span>${escape(building.consumptionIntervalCount24h ?? 0)} ${t("availableIntervals")}</span>`
      ].join("");

      return `
        <header class="vnbBh-header">
          <div>
            <h3 class="vnbBh-title">${t("constructHouse")}</h3>
            <p class="vnbBh-meta">${escape(building.city)}, ${escape(building.streetAddress)}</p>
            <p class="vnbBh-meta">${t("average24hDescription")}</p>
          </div>
          <span class="vnbBh-status">${t(statusKey)}</span>
        </header>
        <div class="vnbBh-scene">
          <div class="vnbBh-zone">
            <div class="vnbBh-roof"><div class="vnbBh-meter"><strong>${t("energyMeter")}</strong><span class="vnbBh-malo vnbBh-small">${escape(building.sharedMeterMaLo || "")}</span></div></div>
            <section class="vnbBh-house">
              <div class="vnbBh-house-heading"><h4>${t("constructHouse")}</h4><span class="vnbBh-icon" aria-hidden="true">&#8962;</span></div>
              <div class="vnbBh-floors">${floors}</div>
              <p class="vnbBh-foot">${escape(consumers.length)} ${t("householdMembers")}</p>
            </section>
          </div>
          <div class="vnbBh-wires">
            <p class="vnbBh-wire-caption">${t("average24h")}</p>
            ${wire(hasSolar, "vnbBh-wire-solar", building.averageSolarGeneration24hKwh)}
            ${wire(hasWind, "vnbBh-wire-wind", building.averageWindGeneration24hKwh)}
          </div>
          <div class="vnbBh-sources">${solarSource}${windSource}</div>
        </div>
        <footer class="vnbBh-legend">${legend}</footer>`;
    }
  });
  return BuildingHouse;
});
