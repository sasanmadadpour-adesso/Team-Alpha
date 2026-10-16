sap.ui.define(["sap/ui/core/Control"], function (Control) {
  "use strict";

  const ranges = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
  const series = [
    ["consumptionKwh", "consumption", "#0a6ed1"],
    ["generationKwh", "generation", "#e9730c"],
    ["localEnergyKwh", "localEnergy", "#0f828f"],
    ["residualGridKwh", "residualGrid", "#7f8c8d"],
    ["exportKwh", "export", "#30914c"]
  ];
  const HEIGHT = 300;
  const PAD = { left: 60, right: 16, top: 16, bottom: 30 };
  const HOURS_PER_BUCKET = { hour: 1, day: 24, week: 168 };
  const INTERVAL_KEYS = { hour: "trendIntervalHour", day: "trendIntervalDay", week: "trendIntervalWeek" };

  function escape(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  const pad2 = value => String(value).padStart(2, "0");

  // Buckets are UTC, so labels are formatted from UTC fields to avoid shifting by the browser time zone.
  function axisLabel(iso, level) {
    const date = new Date(iso);
    const day = `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.`;
    return level === "hour" ? `${day} ${pad2(date.getUTCHours())}:00` : day;
  }

  function fullLabel(iso, level) {
    const date = new Date(iso);
    const day = `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
    return level === "hour" ? `${day} ${pad2(date.getUTCHours())}:00 UTC` : day;
  }

  function niceMax(value) {
    if (!(value > 0)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    const fraction = value / magnitude;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  const EnergyTrend = Control.extend("vnb.constructs.ext.EnergyTrend", {
    metadata: {
      properties: { parentType: { type: "string", defaultValue: "building" }, range: { type: "string", defaultValue: "7d" } }
    },
    init: function () {
      Control.prototype.init.apply(this, arguments);
      this._onModelContextChange = this._onModelContextChange.bind(this);
      this.attachModelContextChange(this._onModelContextChange);
    },
    renderer: {
      apiVersion: 2,
      render: function (rm, control) {
        const id = control.getId();
        rm.openStart("section", control).class("vnbEnergyTrend").openEnd();
        rm.openStart("div").class("vnbTrendToolbar").openEnd();
        rm.openStart("span").class("vnbTrendHeading").openEnd(); rm.text(control._text("trendHeading")); rm.close("span");
        Object.keys(ranges).forEach(range => { rm.openStart("button").attr("id", `${id}-range-${range}`).class("vnbTrendRange").class(control.getRange() === range ? "vnbTrendRangeSelected" : "").attr("data-range", range).attr("type", "button").openEnd(); rm.text(range); rm.close("button"); });
        rm.close("div");
        rm.openStart("div").attr("id", `${id}-status`).class("vnbTrendStatus").openEnd(); rm.text(control._text("trendLoading")); rm.close("div");
        rm.openStart("div").attr("id", `${id}-chart`).class("vnbTrendChart").openEnd(); rm.close("div");
        rm.openStart("div").attr("id", `${id}-legend`).class("vnbTrendLegend").openEnd(); rm.close("div");
        rm.close("section");
      }
    },
    onAfterRendering: function () {
      this.$().off("click.vnbTrend").on("click.vnbTrend", ".vnbTrendRange", event => {
        this.setRange(event.currentTarget.dataset.range);
        this.load(true);
      });
      this._chartEl = document.getElementById(`${this.getId()}-chart`);
      if (this._chartEl) {
        this._chartEl.onpointermove = event => this._onPointerMove(event);
        this._chartEl.onpointerleave = () => this._hideHover();
        if (window.ResizeObserver) {
          this._resizeObserver = this._resizeObserver || new ResizeObserver(() => this._draw());
          this._resizeObserver.disconnect();
          this._resizeObserver.observe(this._chartEl);
        }
      }
      this._draw();
      this.load();
    },
    _onModelContextChange: function () {
      this._requestKey = null;
      if (this.getDomRef()) this.load(true);
    },
    exit: function () {
      this.detachModelContextChange(this._onModelContextChange);
      this._resizeObserver?.disconnect();
      this._requestController?.abort();
      this._requestController = null;
      this._requestKey = null;
    },
    _text: function (key, args) {
      const bundle = this.getModel("i18n")?.getResourceBundle();
      return bundle ? bundle.getText(key, args) : key;
    },
    setRange: function (range) {
      if (!ranges[range]) return;
      this.setProperty("range", range, true);
      const id = this.getId();
      Object.keys(ranges).forEach(key => {
        const button = document.getElementById(`${id}-range-${key}`);
        if (button) button.classList.toggle("vnbTrendRangeSelected", key === range);
      });
    },
    _setStatus: function (text) {
      const el = document.getElementById(`${this.getId()}-status`);
      if (el) el.textContent = text;
    },
    _setError: function (detail) {
      this._rows = null;
      this._setStatus(this._text("trendUnavailable", [detail]));
      this._clear();
    },
    _clear: function () {
      const chartEl = document.getElementById(`${this.getId()}-chart`);
      const legendEl = document.getElementById(`${this.getId()}-legend`);
      if (chartEl) chartEl.innerHTML = "";
      if (legendEl) legendEl.innerHTML = "";
    },
    load: async function (force) {
      const context = this.getBindingContext();
      // Object page sections are bound lazily when they scroll into view; wait for the context instead of failing.
      if (!context) { this._setStatus(this._text("trendLoading")); return; }
      const id = context.getProperty("ID");
      const parentType = context.getPath().startsWith("/Buildings") ? "building" : "construct";
      const malo = context.getProperty("primaryMaLo") || context.getProperty("malo");
      const building = context.getProperty("buildingID") || context.getProperty("buildingId");
      const requestKey = `${parentType}:${id}:${malo || ""}:${this.getRange()}`;
      if (!force && this._requestKey === requestKey) return;
      this._requestKey = requestKey;
      this._requestController?.abort();
      this._requestController = new AbortController();
      const latestMeasurement = context.getProperty("latestMeasurementTime");
      const latest = latestMeasurement ? new Date(latestMeasurement) : new Date("2026-10-16T00:00:00Z");
      if (Number.isNaN(latest.valueOf())) { this._setError(this._text("trendInvalidTime")); return; }
      // The last measured hour starts at `latest`, so the exclusive upper bound is one hour later.
      const end = new Date(latest.valueOf() + 3600000);
      const start = new Date(end.valueOf() - ranges[this.getRange()] * 86400000);
      const entity = parentType === "building" ? "BuildingEnergyTrends" : "ConstructEnergyTrends";
      const filter = `parentID eq '${String(id).replace(/'/g, "''")}' and bucketStart ge ${start.toISOString()} and bucketStart lt ${end.toISOString()}`;
      this._setStatus(this._text("trendLoading"));
      try {
        const liveQuery = new URLSearchParams({ malo: String(malo || ""), range: this.getRange() });
        if (building) liveQuery.set("building", String(building));
        const liveUrl = parentType === "construct" && malo ? `/api/live-energy?${liveQuery}` : null;
        const response = await fetch(liveUrl || `/odata/v4/energy-overview/${entity}?$filter=${encodeURIComponent(filter)}&$orderby=bucketStart`, { signal: this._requestController.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        this.renderChart(payload.value || []);
      } catch (error) { if (error.name !== "AbortError") this._setError(error.message); }
    },
    renderChart: function (rows) {
      this._rows = rows.length ? rows : null;
      this._clear();
      if (!rows.length) { this._setStatus(this._text("trendNoData")); return; }
      const level = rows[0].granularity;
      this._setStatus(`${this._text(INTERVAL_KEYS[level] || "trendIntervalHour")} · ${rows.length}`);
      this._draw();
      const legendEl = document.getElementById(`${this.getId()}-legend`);
      if (legendEl) legendEl.innerHTML = series.map(item => `<span><i style="background:${item[2]}"></i>${escape(this._text(item[1]))}</span>`).join("");
    },
    _draw: function () {
      const chartEl = this._chartEl;
      const rows = this._rows;
      if (!chartEl || !rows?.length) return;
      const level = rows[0].granularity;
      const width = Math.max(320, Math.round(chartEl.clientWidth || 920));
      const innerW = width - PAD.left - PAD.right;
      const innerH = HEIGHT - PAD.top - PAD.bottom;
      const max = niceMax(Math.max(...rows.flatMap(row => series.map(item => Number(row[item[0]]) || 0))));
      const x = index => PAD.left + (rows.length === 1 ? innerW / 2 : index / (rows.length - 1) * innerW);
      const y = value => PAD.top + innerH - (Number(value) || 0) / max * innerH;
      this._layout = { width, innerW, innerH, max, level, x, y };

      const grid = [0, 1, 2, 3, 4].map(step => {
        const value = max * step / 4;
        const line = y(value).toFixed(1);
        return `<line class="vnbTrendGrid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${line}" y2="${line}"/><text class="vnbTrendTick" x="${PAD.left - 8}" y="${line}" text-anchor="end" dominant-baseline="middle">${escape(formatNumber(value))}</text>`;
      }).join("");
      const labelCount = Math.min(rows.length, Math.max(2, Math.floor(innerW / 110)));
      const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, step) => Math.round(step * (rows.length - 1) / Math.max(1, labelCount - 1))))];
      const lastIndex = rows.length - 1;
      const xLabels = labelIndexes.map(index => {
        // Keep the outermost labels inside the plot so they are not clipped at the chart edges.
        const anchor = index === 0 ? "start" : index === lastIndex ? "end" : "middle";
        return `<text class="vnbTrendTick" x="${x(index).toFixed(1)}" y="${HEIGHT - 8}" text-anchor="${anchor}">${escape(axisLabel(rows[index].bucketStart, level))}</text>`;
      }).join("");
      const lines = series.map(item => {
        const d = rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(row[item[0]]).toFixed(1)}`).join(" ");
        return `<path d="${d}" stroke="${item[2]}" fill="none" stroke-width="2" stroke-linejoin="round"/>`;
      }).join("");
      const dots = series.map(item => `<circle class="vnbTrendDot" r="4" fill="${item[2]}" stroke="#fff" stroke-width="1.5" cx="0" cy="0" visibility="hidden"/>`).join("");
      chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${HEIGHT}" width="${width}" height="${HEIGHT}" role="img" aria-label="${escape(this._text("trendHeading"))}">${grid}<line class="vnbTrendAxis" x1="${PAD.left}" x2="${width - PAD.right}" y1="${PAD.top + innerH}" y2="${PAD.top + innerH}"/>${xLabels}${lines}<line class="vnbTrendGuide" x1="0" x2="0" y1="${PAD.top}" y2="${PAD.top + innerH}" visibility="hidden"/>${dots}<rect x="${PAD.left}" y="${PAD.top}" width="${innerW}" height="${innerH}" fill="transparent"/></svg><div class="vnbTrendTooltip" hidden></div>`;
    },
    _onPointerMove: function (event) {
      const layout = this._layout;
      const svg = this._chartEl?.querySelector("svg");
      const rows = this._rows;
      if (!layout || !svg || !rows?.length) return;
      const rect = svg.getBoundingClientRect();
      const svgX = (event.clientX - rect.left) / rect.width * layout.width;
      if (svgX < PAD.left || svgX > layout.width - PAD.right) { this._hideHover(); return; }
      const ratio = (svgX - PAD.left) / layout.innerW;
      const index = Math.min(rows.length - 1, Math.max(0, Math.round(ratio * (rows.length - 1))));
      const row = rows[index];
      const pointX = layout.x(index);
      const guide = this._chartEl.querySelector(".vnbTrendGuide");
      guide.setAttribute("x1", pointX.toFixed(1));
      guide.setAttribute("x2", pointX.toFixed(1));
      guide.setAttribute("visibility", "visible");
      this._chartEl.querySelectorAll(".vnbTrendDot").forEach((dot, dotIndex) => {
        dot.setAttribute("cx", pointX.toFixed(1));
        dot.setAttribute("cy", layout.y(row[series[dotIndex][0]]).toFixed(1));
        dot.setAttribute("visibility", "visible");
      });
      const tooltip = this._chartEl.querySelector(".vnbTrendTooltip");
      const expected = HOURS_PER_BUCKET[layout.level] || 1;
      const coverage = (row.intervalCount || 1) < expected ? ` <span class="vnbTrendCoverage">${escape(this._text("trendCoverage", [row.intervalCount, expected]))}</span>` : "";
      tooltip.innerHTML = `<strong>${escape(fullLabel(row.bucketStart, layout.level))}</strong>${coverage}` + series.map(item => `<span><i style="background:${item[2]}"></i>${escape(this._text(item[1]))}</span><b>${escape(formatNumber(row[item[0]]))}</b>`).join("") + `<em>${escape(this._text("trendUnit"))}</em>`;
      tooltip.hidden = false;
      const pixelX = pointX / layout.width * rect.width;
      tooltip.style.left = `${pixelX}px`;
      tooltip.classList.toggle("vnbTrendTooltipLeft", pixelX > rect.width / 2);
    },
    _hideHover: function () {
      if (!this._chartEl) return;
      this._chartEl.querySelector(".vnbTrendGuide")?.setAttribute("visibility", "hidden");
      this._chartEl.querySelectorAll(".vnbTrendDot").forEach(dot => dot.setAttribute("visibility", "hidden"));
      const tooltip = this._chartEl.querySelector(".vnbTrendTooltip");
      if (tooltip) tooltip.hidden = true;
    }
  });
  return EnergyTrend;
});
