using { vnb.network as db } from '../db/schema';

@path: '/network'
service NetworkService {
  @readonly entity Constructs as projection on db.Constructs {
    *,
    building.ID as buildingID,
    virtual null as participationCriticality : Integer,
    virtual null as warningCriticality       : Integer,
    virtual null as directionLabel           : String(40)
  };
  @readonly entity Buildings as projection on db.Buildings;
  @readonly entity BuildingHourlyProfiles as projection on db.BuildingHourlyProfiles;
  @readonly entity ConstructHourlyValues as projection on db.ConstructHourlyValues;
  @readonly entity Payments as projection on db.Payments {
    *,
    virtual null as amountCriticality : Integer
  };
  @readonly entity DataQualityIssues as projection on db.DataQualityIssues {
    *,
    virtual null as severityCriticality : Integer
  };
  @readonly entity PortfolioSummary as projection on db.PortfolioSummary;
}
