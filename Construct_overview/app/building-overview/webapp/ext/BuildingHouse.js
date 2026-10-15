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

      // Participation is shown as an icon only; the text stays available as tooltip and for screen readers.
      const floors = consumers.map(consumer => {
        const participating = consumer.participationCode === "YES";
        const label = escape(consumer.participationLabel || "");
        return `<div class="vnbBh-floor">${malo(consumer.importMaLo, consumer.targetConstructID)}<span class="vnbBh-mk7 ${participating ? "vnbBh-mk7-yes" : "vnbBh-mk7-no"}" role="img" title="${label}" aria-label="${escape(this._text("mk7Participation"))}: ${label}">${participating ? "&#10003;" : "&#10005;"}</span></div>`;
      }).join("") || `<p class="vnbBh-note">${t("noMembers")}</p>`;

      const members = (rows, emptyText) => rows.length
        ? rows.map(row => `<div class="vnbBh-source-member">${malo(row.marketLocationIdentifier, row.targetConstructID)}</div>`).join("")
        : `<p class="vnbBh-note">${escape(emptyText)}</p>`;

      const wire = (visible, className, value, caption) => visible
        ? `<div class="vnbBh-wire ${className}"><span class="vnbBh-wire-label">${caption ? `${escape(caption)} ` : ""}${escape(formatKwh(value))} kWh</span></div>`
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
        `<span class="vnbBh-key vnbBh-key-import"><i></i>${t("gridImport")}</span>`,
        `<span class="vnbBh-key vnbBh-key-export"><i></i>${t("gridExport")}</span>`,
        `<span><b class="vnbBh-mk7 vnbBh-mk7-yes">&#10003;</b> ${t("mk7Yes")}</span>`,
        `<span><b class="vnbBh-mk7 vnbBh-mk7-no">&#10005;</b> ${t("mk7No")}</span>`,
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
          <section class="vnbBh-grid">
            <div class="vnbBh-pylon" aria-hidden="true"><i></i><i></i><i></i></div>
            <h4>${t("gridNode")}</h4>
            <p>${t("gridNodeHint")}</p>
          </section>
          <div class="vnbBh-wires vnbBh-gridwires">
            <p class="vnbBh-wire-caption">${t("average24h")}</p>
            ${wire(true, "vnbBh-wire-import", building.averageGridImport24hKwh, this._text("gridImportShort"))}
            ${wire(true, "vnbBh-wire-export", building.averageGridExport24hKwh, this._text("gridExportShort"))}
          </div>
          <div class="vnbBh-zone">
            <div class="vnbBh-building">
              <div class="vnbBh-roof"><div class="vnbBh-meter"><strong>${t("energyMeter")}</strong><span class="vnbBh-malo vnbBh-small">${escape(building.sharedMeterMaLo || "")}</span></div></div>
              <section class="vnbBh-house">
                <div class="vnbBh-house-heading"><h4>${t("constructHouse")}</h4><span class="vnbBh-icon" aria-hidden="true">&#8962;</span></div>
                <div class="vnbBh-floors">${floors}</div>
                <p class="vnbBh-foot">${escape(consumers.length)} ${t("householdMembers")}</p>
              </section>
            </div>
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
