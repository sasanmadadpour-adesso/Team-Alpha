# Team-Alpha
Vibe Coding Challenge 2026 - Team Alpha


# Use Case 1 — Mieterstrom Onboarding, System Visualization & Data Validation

**Vibe Coding Challenge | One web application | Three connected MVPs**

## 1. Business Context and Problem

In a **Mieterstrom (tenant electricity)** model, electricity generated in or near a residential building can be supplied directly to participating households.

Installing solar panels or a wind generator is only part of the challenge. A utility must also know which operator is responsible for each generation asset, which household belongs to which building, which meter and contract are assigned to each household, and who has actually joined the Mieterstrom scheme.

In practice, these records may be scattered across spreadsheets and different systems. A wrong meter identifier, a household linked to the wrong building, or missing contract details can undermine the accuracy of the metering and supply setup.

Before operating the scheme, the utility needs a clear way to collect, organize, visualize and check its information.

**Challenge goal:** Build one web application that covers **digital onboarding, a schematic system overview, and data error detection**.

This use case is about **configuration and data quality**, not electricity billing.

## 2. Stakeholders and Provided Information

- **Participant (Teilnehmer):** A household with details such as its building, meter and contract. Eligibility is indicated by the existing `Teilnahme MK7` column.
- **Plant Operator (Anlagenbetreiber):** The person or organization responsible for one or more generation assets.
- **Generation Asset (Erzeugungsanlage):** A solar or wind installation identified by type, capacity, location and asset ID.
- **Mieterstrom Supplier:** The entity responsible for supplying participating households within the business scenario.
- **E.ON:** The simplified scenario's grid operator and supplementary electricity supplier.
- **Metiundo:** The metering service provider.

**Input:** The supplied Excel dataset with producer registration, household records, buildings, contracts, meters and reference information.

Use the **existing records**; do not invent new households or installations to complete your demonstration.

Teams may build forms to view and edit copies of existing records within the application.

## 3. Three MVP Tasks

### MVP 1 — Participant & Operator Onboarding

Build an interface for viewing and managing both **participant** and **plant operator** data.

The app should read the supplied records and present them in understandable forms or tables while maintaining the links between related records.

For a participant, users should be able to identify the associated building and meter, the contract validity period, and the value in `Teilnahme MK7`.

For an operator, the app should show the associated generation assets, whether they are solar or wind, their capacities, and their locations.

**Practical example:** Selecting a household opens its existing meter, building and contract information. Selecting an operator displays the assets belonging to that operator.

Simply showing unrelated spreadsheet columns is not sufficient: the **relationships between records** matter.

### MVP 2 — Energy Community Visualization

Create a **schematic overview** so that users can understand the entire configuration without reading every spreadsheet row.

Illustrate relationships such as:

- Building → households and meters
- Operator → generation assets
- Generation assets → their assigned locations
- The roles of the Mieterstrom supplier, E.ON and Metiundo

The schematic can use boxes, connectors and labels.

Interactive electricity-consumption or price charts are **not required**.

Households marked `nein` should remain visible but must be clearly marked as **non-participants**.

Being a non-participant is **not itself a data error**.

### MVP 3 — Data Validation & Error Reporting

Implement transparent checks of the information using defined rules.

Potential checks include:

- Missing mandatory data
- Duplicated meter IDs
- References to nonexistent buildings or operators
- Inconsistent household-to-meter relationships
- Contract dates outside the required period

Every detected problem should report at least the **affected record, error category and reason**.

Valid records should also be recognizable.

If a particular error is not present in the supplied data, the app must not fabricate one.

**Important scope limit:** The application should **detect and report errors only**. It must **not** provide correction recommendations, automatic fixes, or invented replacement values.

## 4. Expected Deliverable and Boundaries

Deliver **one working web application with three connected sections**:

1. Onboarding and data management
2. Schematic configuration overview
3. Validation and error reporting

Users should be able to follow a participant or operator to their linked records and understand which information is complete or problematic.

Key assessment criteria include correct importing of source data, stable identifiers and relationships, accurate handling of `Teilnahme MK7`, a clear schematic, and traceable error messages.

**Out of scope:** Hourly production/consumption calculations, energy allocation, electricity billing, automated correction proposals, and live integrations with SAP, E.ON or Metiundo.

Teams may choose their architecture, development tools and UI design.


------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------





# Use Case 1 — Mieterstrom-Onboarding, Systemvisualisierung und Datenvalidierung

**Vibe Coding Challenge | Eine Webanwendung | Drei miteinander verbundene MVPs**

## 1. Geschäftlicher Hintergrund und Problemstellung

In einem **Mieterstrommodell** kann lokal erzeugter Strom direkt an teilnehmende Haushalte eines Gebäudes geliefert werden.

Die Installation einer Photovoltaik- oder Windenergieanlage allein reicht jedoch nicht aus: Es muss auch bekannt sein, welcher Betreiber für welche Anlage verantwortlich ist, welcher Haushalt zu welchem Gebäude gehört, welcher Zähler und welcher Vertrag ihm zugeordnet sind und ob der Haushalt überhaupt am Mieterstrommodell teilnimmt.

In der Praxis liegen solche Informationen häufig verteilt in Tabellen und unterschiedlichen Systemen vor.

Eine falsche Zählernummer, eine fehlerhafte Gebäudezuordnung oder unvollständige Vertragsdaten können den Aufbau eines verlässlichen Mess- und Versorgungskonzepts erschweren.

Ein Energieunternehmen benötigt deshalb eine Anwendung, mit der sich die Informationen zentral erfassen, ihre Zusammenhänge darstellen und ihre Qualität überprüfen lassen.

**Ziel der Challenge:** Entwickelt eine gemeinsame Webanwendung für **digitales Onboarding, eine schematische Systemübersicht und die Erkennung von Datenfehlern**.

Dieser Use Case konzentriert sich auf **Konfiguration und Datenqualität**, nicht auf die Stromabrechnung.

## 2. Beteiligte Akteure und Daten

- **Teilnehmer:** Ein Haushalt, dem ein Gebäude, ein Zähler und ein Vertrag zugeordnet sind. Ob er am Modell teilnimmt, steht in der bestehenden Spalte `Teilnahme MK7`.
- **Anlagenbetreiber:** Eine Person oder Organisation, die eine oder mehrere Erzeugungsanlagen betreibt.
- **Erzeugungsanlage:** Eine Solar- oder Windenergieanlage mit Kennung, Anlagentyp, Leistung und Standort.
- **Mieterstromlieferant:** Der für die Versorgung der teilnehmenden Haushalte zuständige Akteur.
- **E.ON:** Im vereinfachten Szenario Netzbetreiber und Lieferant des ergänzenden Reststroms.
- **Metiundo:** Der Messstellenbetreiber im Szenario.

**Eingabe:** Der bereitgestellte Excel-Datensatz enthält Informationen zur Erzeugerregistrierung, zu Haushalten, Gebäuden, Verträgen, Zählern und Referenzdaten.

Verwendet **die vorhandenen Datensätze** und erfindet keine zusätzlichen Haushalte oder Anlagen.

Formulare zur Anzeige und testweisen Bearbeitung vorhandener Datensätze sind möglich.

## 3. Drei MVP-Aufgaben

### MVP 1 — Participant & Operator Onboarding

Erstellt eine Eingabe- und Verwaltungsoberfläche für **Teilnehmer** und **Anlagenbetreiber**.

Die Anwendung soll vorhandene Daten einlesen und in verständlichen Formularen oder Tabellen darstellen. Dabei müssen die Beziehungen zwischen den Datensätzen erhalten bleiben.

Bei einem Teilnehmer sollen Gebäude, Zähler, Vertragslaufzeit und der Wert aus `Teilnahme MK7` erkennbar sein.

Bei einem Anlagenbetreiber sollen die zugeordneten Erzeugungsanlagen mit Typ (Solar/Wind), Leistung und Standort angezeigt werden.

**Beispiel:** Wählt ein Nutzer einen Haushalt aus, sieht er die zugehörigen Zähler-, Gebäude- und Vertragsinformationen.

Wählt er einen Anlagenbetreiber aus, sieht er dessen Anlagen.

Es geht also nicht nur um die Darstellung einzelner Excel-Spalten, sondern um **korrekte Datenbeziehungen**.

### MVP 2 — Energy Community Visualization

Erstellt eine **schematische Darstellung** der Mieterstromstruktur, damit der Zusammenhang auch ohne das Lesen aller Excel-Zeilen verständlich wird.

Die Visualisierung soll beispielsweise folgende Beziehungen darstellen:

- Gebäude → Haushalte und Zähler
- Anlagenbetreiber → Erzeugungsanlagen
- Erzeugungsanlagen → zugeordnete Standorte
- Rollen von Mieterstromlieferant, E.ON und Metiundo

Die Darstellung kann aus Boxen, Verbindungslinien und Beschriftungen bestehen.

Interaktive Verbrauchs- oder Strompreiskurven sind **nicht erforderlich**.

Haushalte mit dem Wert `nein` sollen sichtbar bleiben, aber eindeutig als **Nichtteilnehmer** gekennzeichnet werden.

Die Nichtteilnahme ist **kein Datenfehler**.

### MVP 3 — Data Validation & Error Reporting

Implementiert nachvollziehbare Prüfregeln für die erfassten Daten.

Beispiele sind:

- Fehlende Pflichtfelder
- Doppelte Zählerkennungen
- Verweise auf nicht existierende Gebäude oder Betreiber
- Widersprüchliche Haushalt-Zähler-Zuordnungen
- Vertragsdaten außerhalb des relevanten Zeitraums

Jeder gefundene Fehler soll mindestens den **betroffenen Datensatz, die Fehlerart und den Grund** nennen.

Auch gültige Datensätze sollen als solche erkennbar sein.

Falls ein bestimmter Fehlertyp im Datensatz nicht vorkommt, darf die Anwendung keine künstlichen Fehler melden.

**Wichtige Abgrenzung:** Die Anwendung soll Fehler **ausschließlich erkennen und melden**.

**Korrekturvorschläge, automatische Korrekturen und erfundene Ersatzwerte** sind nicht Bestandteil der Aufgabe.

## 4. Erwartetes Ergebnis und Abgrenzung

Liefert **eine funktionsfähige Webanwendung mit drei verbundenen Bereichen**:

1. Onboarding und Datenverwaltung
2. Schematische Gesamtübersicht
3. Validierung und Fehlerbericht

Nutzer sollen von einem Teilnehmer oder Anlagenbetreiber zu dessen verknüpften Informationen gelangen und erkennen können, welche Daten vollständig bzw. fehlerhaft sind.

Wichtige Bewertungskriterien sind der korrekte Datenimport, konsistente Kennungen und Beziehungen, die richtige Verwendung von `Teilnahme MK7`, eine verständliche schematische Darstellung sowie nachvollziehbare Fehlermeldungen.

**Nicht Bestandteil:** Stündliche Verbrauchs- und Erzeugungsrechnungen, Energiezuordnung, Stromabrechnung, automatische Fehlerkorrektur oder produktive Anbindungen an SAP, E.ON oder Metiundo.

Architektur, Werkzeuge und UI-Gestaltung können die Teams selbst wählen.
