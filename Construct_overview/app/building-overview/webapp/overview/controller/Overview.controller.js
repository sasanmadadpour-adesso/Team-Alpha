sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/core/routing/HashChanger",
  "vnb/constructs/ext/ListActions",
  "./formatter",
  "./search"
], function (Controller, JSONModel, MessageToast, HashChanger, ListActions, formatter, search) {
  "use strict";

  const ODATA = "/odata/v4/energy-overview";

  // Overview of buildings (roots) and their members (households, producers, shared counter).
  // Starts collapsed. Search runs in "find" mode (nothing is filtered, matches are expanded to and
  // scrolled to) or in "filter" mode (non-matching rows are hidden). Both modes mark matching rows.
  return Controller.extend("vnb.constructs.overview.controller.Overview", {
    formatter: formatter,

    onInit: function () {
      this._nodes = [];
      this._roots = [];
      this._flat = [];
      this._parentOf = new Map();
      this._ui = new JSONModel({
        query: "", mode: "find", matchIds: [], currentId: null, matchPos: 0, rowCount: 1,
        matchLabel: "", fuzzyHint: "", navigable: false, tableTitle: "",
        stats: { buildings: 0, households: 0, participating: 0, finished: 0 }
      });
      this.getView().setModel(this._ui, "ui");
      this.getView().setModel(new JSONModel([]), "tree");
      this._load();
    },

    _text: function (key, args) {
      const bundle = this.getOwnerComponent().getModel("i18n")?.getResourceBundle();
      return bundle ? bundle.getText(key, args) : key;
    },

    _table: function () {
      return this.byId("overviewTree");
    },

    _load: async function () {
      try {
        const response = await fetch(`${ODATA}/ConstructTreeNodes`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        this._nodes = body.value || [];
        this._buildTree();
        this._setStats();
        this._applyTree();
      } catch (error) {
        MessageToast.show(this._text("trendUnavailable", [error.message]));
      }
    },

    // Nested copies for the TreeTable plus a flat list in display order (building, then its members).
    _buildTree: function () {
      const copies = new Map(this._nodes.map(node => [node.ID, { ...node }]));
      this._parentOf = new Map();
      this._roots = [];
      for (const node of this._nodes) {
        const copy = copies.get(node.ID);
        const parent = node.parentID && copies.get(node.parentID);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(copy);
          this._parentOf.set(node.ID, node.parentID);
        } else {
          this._roots.push(copy);
        }
      }
      this._flat = [];
      for (const root of this._roots) {
        this._flat.push(root, ...(root.children || []));
      }
    },

    _setStats: function () {
      const households = this._nodes.filter(node => node.nodeType === "HOUSEHOLD");
      this._ui.setProperty("/stats", {
        buildings: this._nodes.filter(node => node.nodeType === "BUILDING").length,
        households: households.length,
        participating: households.filter(node => node.participationCriticality !== 1).length,
        finished: households.filter(node => node.participationCriticality === 3).length
      });
    },

    // Replaces the tree data. Only called when the displayed set changes (load, mode switch, filter typing),
    // so manual expansions in find mode survive while matches are navigated.
    _applyTree: function () {
      const ui = this._ui.getData();
      const filtering = ui.mode === "filter" && ui.query.trim() !== "";
      const hits = new Set(ui.matchIds);
      let roots = this._roots;
      if (filtering) {
        roots = this._roots
          .filter(root => hits.has(root.ID) || (root.children || []).some(child => hits.has(child.ID)))
          .map(root => (hits.has(root.ID) || !root.children ? root : { ...root, children: root.children.filter(child => hits.has(child.ID)) }));
      }
      this.getView().getModel("tree").setData(roots);
      this._ui.setProperty("/tableTitle", this._text("overviewTableTitle", [roots.length]));
      const table = this._table();
      if (filtering) table.expandToLevel(1);
      else table.collapseAll();
      this._syncRowCount();
      this._mark();
    },

    // The fixed row mode needs the number of visible rows; it is kept in sync with the tree binding.
    _syncRowCount: function () {
      const binding = this._table().getBinding("rows");
      this._ui.setProperty("/rowCount", Math.max(1, binding ? binding.getLength() : 1));
    },

    // Visible row index of a node (roots and expanded children), or -1.
    _indexOf: function (id) {
      const binding = this._table().getBinding("rows");
      if (!binding) return -1;
      for (let index = 0; index < binding.getLength(); index += 1) {
        const context = binding.getContextByIndex(index);
        if (context && context.getProperty("ID") === id) return index;
      }
      return -1;
    },

    // Expands the containing building if needed, then scrolls the row into view.
    _reveal: function (id) {
      if (!id) return;
      const table = this._table();
      let index = this._indexOf(id);
      if (index < 0) {
        const parentIndex = this._indexOf(this._parentOf.get(id));
        if (parentIndex < 0) return;
        if (!table.isExpanded(parentIndex)) table.expand(parentIndex);
        index = this._indexOf(id);
      }
      if (index >= 0) setTimeout(() => this._scrollTo(id), 50);
    },

    // Rows are all rendered (fixed row count), so the page itself scrolls to the matching row.
    _scrollTo: function (id) {
      const row = this._table().getRows().find(item => {
        const context = item.getBindingContext("tree");
        return context && context.getProperty("ID") === id;
      });
      const dom = row && row.getDomRef();
      if (dom) dom.scrollIntoView({ block: "center", behavior: "smooth" });
    },

    _setPosition: function (position) {
      const ui = this._ui.getData();
      const count = ui.matchIds.length;
      if (!count) {
        this._ui.setProperty("/currentId", null);
        this._ui.setProperty("/matchPos", 0);
        this._ui.setProperty("/matchLabel", ui.query.trim() ? this._text("searchNoMatch") : "");
        this._ui.setProperty("/navigable", false);
        this._mark();
        return;
      }
      const pos = ((position % count) + count) % count;
      this._ui.setProperty("/matchPos", pos);
      this._ui.setProperty("/currentId", ui.matchIds[pos]);
      this._ui.setProperty("/matchLabel", this._text("searchMatches", [pos + 1, count]));
      this._ui.setProperty("/navigable", count > 1);
      this._reveal(ui.matchIds[pos]);
      this._mark();
    },

    // Marks matching rows in the DOM (background tint); the RowSettings highlight bar comes from the formatter.
    _mark: function () {
      const table = this._table();
      if (!table) return;
      const ui = this._ui.getData();
      const hits = new Set(ui.matchIds);
      for (const row of table.getRows()) {
        const dom = row.getDomRef();
        const context = row.getBindingContext("tree");
        const id = context && context.getProperty("ID");
        if (!dom) continue;
        dom.classList.toggle("vnbOv-hit", hits.has(id));
        dom.classList.toggle("vnbOv-current", Boolean(id) && id === ui.currentId);
      }
    },

    onSearch: function (event) {
      const query = event.getSource().getValue();
      this._ui.setProperty("/query", query);
      const ui = this._ui.getData();
      const result = search.findMatches(this._flat, query);
      this._ui.setProperty("/matchIds", result.ids);
      this._ui.setProperty("/fuzzyHint", result.mode === "fuzzy" ? this._text("searchFuzzyHint") : "");
      if (ui.mode === "filter" || !query.trim()) this._applyTree();
      this._setPosition(0);
    },

    onModeChange: function (event) {
      this._ui.setProperty("/mode", event.getParameter("item").getKey());
      this._applyTree();
      this._setPosition(this._ui.getProperty("/matchPos"));
    },

    onNextMatch: function () {
      this._setPosition(this._ui.getProperty("/matchPos") + 1);
    },

    onPrevMatch: function () {
      this._setPosition(this._ui.getProperty("/matchPos") - 1);
    },

    onExpandAll: function () {
      this._table().expandToLevel(1);
      this._syncRowCount();
      this._mark();
    },

    onCollapseAll: function () {
      this._table().collapseAll();
      this._syncRowCount();
      this._mark();
    },

    onRowsUpdated: function () {
      this._syncRowCount();
      this._mark();
    },

    onNavigate: function (event) {
      const context = event.getSource().getBindingContext("tree");
      const hash = context && context.getProperty("detailHash");
      if (hash) HashChanger.getInstance().setHash(hash.replace(/^#/, ""));
    },

    onToggleLanguage: function () {
      ListActions.toggleLanguage();
    }
  });
});
