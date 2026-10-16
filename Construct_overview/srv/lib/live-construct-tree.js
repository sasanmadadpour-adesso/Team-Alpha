function externalTreeNodes(constructs, syncState = 'CURRENT') {
  const roots = new Map();
  const members = [];
  for (const row of constructs) {
    const buildingID = String(row.buildingID || row.buildingId || '').trim();
    let parentID = null;
    if (buildingID) {
      parentID = `external-building-${buildingID}`;
      if (!roots.has(buildingID)) {
        roots.set(buildingID, {
          ID: parentID,
          parentID: null,
          nodeType: 'BUILDING',
          displayName: buildingID,
          malo: '',
          meLo: '',
          roleLabel: 'Building',
          city: row.city || null,
          streetAddress: row.streetAddress || null,
          participationMark: '',
          participationCriticality: 3,
          totalConsumptionKwh: null,
          totalGenerationKwh: null,
          localEnergyKwh: null,
          residualGridKwh: null,
          exportKwh: null,
          hasDataWarning: false,
          warningCriticality: 3,
          detailHash: null,
          ownerFirstName: null,
          ownerLastName: null,
          ownerName: null,
          lifecycleStatus: 'UMGESTELLT',
          lifecycleCriticality: 3,
          sourceSystem: row.sourceSystem || 'UMSTELLUNG',
          syncState
        });
      }
    }
    members.push({
      ID: row.ID || `external-${row.primaryMaLo}`,
      parentID,
      nodeType: row.nodeType || (row.roleCode === 'HOUSEHOLD' ? 'HOUSEHOLD' : row.roleCode === 'GENERATION' ? 'PRODUCER' : 'CONSTRUCT'),
      displayName: row.displayName || row.primaryMaLo,
      malo: row.primaryMaLo,
      meLo: row.meLo,
      roleLabel: row.roleLabel || row.roleCode,
      city: row.city,
      streetAddress: row.streetAddress,
      participationMark: row.participationMark,
      participationCriticality: row.participationCriticality,
      totalConsumptionKwh: row.totalConsumptionKwh,
      totalGenerationKwh: row.totalGenerationKwh,
      localEnergyKwh: row.localEnergyKwh,
      residualGridKwh: row.residualGridKwh,
      exportKwh: row.exportKwh,
      hasDataWarning: row.hasDataWarning,
      warningCriticality: row.warningCriticality,
      detailHash: `#/Constructs('${encodeURIComponent(row.ID || `external-${row.primaryMaLo}`)}')`,
      ownerFirstName: row.ownerFirstName,
      ownerLastName: row.ownerLastName,
      ownerName: row.ownerName,
      lifecycleStatus: 'UMGESTELLT',
      lifecycleCriticality: 3,
      sourceSystem: row.sourceSystem || 'UMSTELLUNG',
      syncState
    });
  }
  return [...roots.values(), ...members];
}

module.exports = { externalTreeNodes };
