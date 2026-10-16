const { createWorkbookRepository } = require('../srv/lib/workbook-loader');
const { calculate } = require('../srv/lib/energy-calculator');

const snapshot = createWorkbookRepository().getSnapshot();
const result = calculate(snapshot);
console.log(JSON.stringify({
  workbook: 'Dataset_English.xlsx',
  sheets: 7,
  producers: snapshot.producerOnboardings.length,
  participants: snapshot.participants.length,
  consumptionReadings: snapshot.consumption.length,
  generationReadings: snapshot.generation.length,
  priceIntervals: snapshot.prices.length,
  buildings: result.buildingOverviews.length,
  portfolio: result.portfolio[0]
}, null, 2));
