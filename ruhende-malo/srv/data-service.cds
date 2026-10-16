using { mk7.controlcenter as db } from '../db/schema';

/** Read-only workbook data service. Personal producer fields are deliberately excluded. */
@path: '/odata/v4/data'
service DataService {
  @readonly entity ImportSheets as projection on db.ImportedSheets;
  @readonly entity Producers as projection on db.ProducerOnboarding excluding { firstName, lastName, email, sourceData };
  @readonly entity HourlyConsumption as projection on db.HourlyConsumption;
  @readonly entity HourlyGeneration as projection on db.HourlyGeneration;
  @readonly entity EnergyPrices as projection on db.EnergyPrices;
  @readonly entity FieldDescriptions as projection on db.SourceFieldDescriptions;
  @readonly entity FinancialRules as projection on db.FinancialRules;
}
