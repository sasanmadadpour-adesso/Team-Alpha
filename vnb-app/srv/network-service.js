const cds = require('@sap/cds');

module.exports = class NetworkService extends cds.ApplicationService {
  async init() {
    const { Constructs, Payments, DataQualityIssues } = this.entities;

    this.after('READ', Constructs, (rows) => {
      for (const row of [].concat(rows || [])) {
        row.participationCriticality = row.participationCode === 'YES' ? 3 : row.participationCode === 'NO' ? 2 : 0;
        row.warningCriticality = row.hasDataWarning ? 2 : 3;
        row.directionLabel = ({
          CONSUMPTION: 'Verbrauch / Consumption',
          GENERATION: 'Erzeugung / Generation',
          RESIDUAL: 'Reststrom / Residual supply',
          BIDIRECTIONAL: 'Bezug & Einspeisung / Import & export'
        })[row.directionCode] || row.directionCode;
      }
    });

    this.after('READ', Payments, (rows) => {
      for (const row of [].concat(rows || [])) row.amountCriticality = row.amount < 0 ? 2 : 3;
    });

    this.after('READ', DataQualityIssues, (rows) => {
      for (const row of [].concat(rows || [])) row.severityCriticality = row.severityCode === 'WARNING' ? 2 : 1;
    });

    return super.init();
  }
};
