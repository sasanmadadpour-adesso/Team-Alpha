# Workbook Data Mapping

Source: unchanged file `data/source/Datensatz_Deutsch.xlsx`, sheet `MK7 Teilnehmer`.

| Excel field | Persistence field |
| --- | --- |
| `gebaeude_id` | `buildingId` |
| `mk7_rolle` | `role` |
| `Teilnahme MK7` | `participationRaw`, normalized `participates` |
| `messlokation_id_MeLo` | `meloId` as a string |
| `marktlokation_id_bezug_MaLo` | `maloId` as a string |
| `marktlokation_id_einspeisung_MaLo` | `generationFeedInMaloId` as a string |
| `mk7_versorgungsbeginn_utc` | `supplyStartUtc` as `YYYY-MM-DD` |
| `vertragsbeginn_utc`, `vertragsende_utc` | `contractFromUtc`, `contractToUtc` |

`reststromMaloId` is not hardcoded. It is derived from the residual-supply row in the same building. Ambiguous global MaLo assignments remain visible in the source rows and are marked with `maloConflict=true`.
