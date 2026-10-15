function sum(rows, field) { return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0); }
function round(value, digits = 3) { return Number(value.toFixed(digits)); }

function calculate(snapshot) {
  const eligible = snapshot.participants.filter(p => p.role === 'Household Consumption' && p.participation === 'Ja');
  const excluded = snapshot.participants.filter(p => p.role === 'Household Consumption' && p.participation !== 'Ja');
  const participantByMeter = new Map(snapshot.participants.map(p => [p.meteringLocationId, p]));
  const buildings = [...new Set(snapshot.participants.map(p => p.buildingId))];
  const priceByTime = new Map(snapshot.prices.map(p => [p.startTime, p]));
  const balanceMap = new Map();
  const participantTotals = new Map(eligible.map(p => [p.meteringLocationId, { consumption: 0, local: 0, residual: 0 }]));

  for (const buildingId of buildings) {
    const consumption = snapshot.consumption.filter(r => r.buildingId === buildingId);
    const generation = snapshot.generation.filter(r => r.buildingId === buildingId);
    const times = new Set([...consumption, ...generation].map(r => r.startTime));
    for (const startTime of times) {
      const generationRows = generation.filter(r => r.startTime === startTime);
      const eligibleConsumption = consumption.filter(r => r.startTime === startTime && participantByMeter.get(r.meteringLocationId)?.role === 'Household Consumption' && participantByMeter.get(r.meteringLocationId)?.participation === 'Ja');
      const generationKwh = sum(generationRows, 'generationKwh');
      const eligibleConsumptionKwh = sum(eligibleConsumption, 'consumptionKwh');
      const localEnergyKwh = Math.min(generationKwh, eligibleConsumptionKwh);
      const solarGenerationKwh = sum(generationRows.filter(r => r.productionType === 'Solar'), 'generationKwh');
      const solarLocalEnergyKwh = Math.min(solarGenerationKwh, eligibleConsumptionKwh);
      const key = `${buildingId}-${startTime}`;
      balanceMap.set(key, { ID: key, buildingId, startTime, endTime: generationRows[0]?.endTime || eligibleConsumption[0]?.endTime, generationKwh: round(generationKwh), eligibleConsumptionKwh: round(eligibleConsumptionKwh), localEnergyKwh: round(localEnergyKwh), residualGridEnergyKwh: round(Math.max(0, eligibleConsumptionKwh - generationKwh)), exportEnergyKwh: round(Math.max(0, generationKwh - eligibleConsumptionKwh)), solarGenerationKwh: round(solarGenerationKwh), solarLocalEnergyKwh: round(solarLocalEnergyKwh), marketPriceEurKwh: priceByTime.get(startTime)?.marketPriceEurKwh ?? null });
      for (const row of eligibleConsumption) {
        const totals = participantTotals.get(row.meteringLocationId);
        const share = eligibleConsumptionKwh ? row.consumptionKwh / eligibleConsumptionKwh : 0;
        totals.consumption += row.consumptionKwh;
        totals.local += localEnergyKwh * share;
        totals.residual += Math.max(0, eligibleConsumptionKwh - generationKwh) * share;
      }
    }
  }

  const hourlyBalances = [...balanceMap.values()];
  const buildingOverviews = buildings.map(buildingId => {
    const participants = snapshot.participants.filter(p => p.buildingId === buildingId);
    const producers = snapshot.producerOnboardings.filter(p => p.buildingId === buildingId);
    const balances = hourlyBalances.filter(b => b.buildingId === buildingId);
    const totalConsumptionKwh = sum(balances, 'eligibleConsumptionKwh');
    const totalGenerationKwh = sum(balances, 'generationKwh');
    const localEnergyKwh = sum(balances, 'localEnergyKwh');
    return { buildingId, city: participants[0]?.city, address: participants[0]?.streetAddress, operator: participants[0]?.operator, productionTypes: [...new Set(producers.map(p => p.productionType))].join(', '), installedCapacityKw: round(sum(producers, 'plantCapacityKw')), eligibleHouseholds: eligible.filter(p => p.buildingId === buildingId).length, excludedHouseholds: excluded.filter(p => p.buildingId === buildingId).length, totalConsumptionKwh: round(totalConsumptionKwh), totalGenerationKwh: round(totalGenerationKwh), localEnergyKwh: round(localEnergyKwh), residualGridEnergyKwh: round(sum(balances, 'residualGridEnergyKwh')), exportEnergyKwh: round(sum(balances, 'exportEnergyKwh')), selfSufficiencyPercent: totalConsumptionKwh ? round(localEnergyKwh / totalConsumptionKwh * 100, 2) : 0, localGenerationUtilizationPercent: totalGenerationKwh ? round(localEnergyKwh / totalGenerationKwh * 100, 2) : 0 };
  });
  const participantOverviews = eligible.map(p => { const t = participantTotals.get(p.meteringLocationId); return { meteringLocationId: p.meteringLocationId, buildingId: p.buildingId, city: p.city, streetAddress: p.streetAddress, role: p.role, participation: p.participation, eligibleForSettlement: true, totalConsumptionKwh: round(t.consumption), localEnergyAllocatedKwh: round(t.local), residualGridEnergyKwh: round(t.residual) }; });
  for (const p of excluded) participantOverviews.push({ meteringLocationId: p.meteringLocationId, buildingId: p.buildingId, city: p.city, streetAddress: p.streetAddress, role: p.role, participation: p.participation, eligibleForSettlement: false, totalConsumptionKwh: 0, localEnergyAllocatedKwh: 0, residualGridEnergyKwh: 0 });

  const financial = buildingOverviews.map(b => {
    const balances = hourlyBalances.filter(x => x.buildingId === b.buildingId);
    const prices = new Map(snapshot.prices.map(p => [p.startTime, p]));
    const participantElectricityChargesEur = balances.reduce((n, x) => n + x.eligibleConsumptionKwh * (prices.get(x.startTime)?.retailPriceEurKwh || 0), 0);
    const localElectricityPurchaseEur = balances.reduce((n, x) => n + x.localEnergyKwh * (prices.get(x.startTime)?.plantPurchasePriceEurKwh || 0), 0);
    const residualProcurementCostEur = balances.reduce((n, x) => n + x.residualGridEnergyKwh * (prices.get(x.startTime)?.marketPriceEurKwh || 0), 0);
    const exportRemunerationEur = balances.reduce((n, x) => n + x.exportEnergyKwh * (prices.get(x.startTime)?.exportRemunerationEurKwh || 0), 0);
    const mieterstromSubsidyEur = balances.reduce((n, x) => n + x.solarLocalEnergyKwh * (prices.get(x.startTime)?.mieterstromSubsidyEurKwh || 0), 0);
    const meteringFeesEur = eligible.filter(p => p.buildingId === b.buildingId).length * (snapshot.prices[0]?.meteringFeeEurPerMeter24h || 0);
    return { buildingId: b.buildingId, participantElectricityChargesEur: round(participantElectricityChargesEur, 2), localElectricityPurchaseEur: round(localElectricityPurchaseEur, 2), residualProcurementCostEur: round(residualProcurementCostEur, 2), exportRemunerationEur: round(exportRemunerationEur, 2), mieterstromSubsidyEur: round(mieterstromSubsidyEur, 2), meteringFeesEur: round(meteringFeesEur, 2) };
  });
  return { buildingOverviews, participantOverviews, hourlyBalances, financial, portfolio: [{ ID: 'portfolio', buildingCount: buildingOverviews.length, eligibleHouseholdCount: eligible.length, excludedHouseholdCount: excluded.length, totalConsumptionKwh: round(sum(buildingOverviews, 'totalConsumptionKwh')), totalGenerationKwh: round(sum(buildingOverviews, 'totalGenerationKwh')), localEnergyKwh: round(sum(buildingOverviews, 'localEnergyKwh')), residualGridEnergyKwh: round(sum(buildingOverviews, 'residualGridEnergyKwh')), exportEnergyKwh: round(sum(buildingOverviews, 'exportEnergyKwh')), participantElectricityChargesEur: round(sum(financial, 'participantElectricityChargesEur'), 2) }] };
}

module.exports = { calculate };
