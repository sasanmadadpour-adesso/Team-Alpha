# MK7 Control Center: zwei Kernaussagen des MVP

> **SIMULATION — NO SAP CONNECTION**
> Validierung, Transaktionen und Persistenz (SQLite) laufen real. Die SAP-Antworten sind simuliert.

| | Kernaussage |
|---|---|
| **1** | **Ein Prozess, der automatisch läuft und nur dort anhält, wo ein Mensch entscheiden muss.** |
| **2** | **Fachlich korrekte Umstellung nach Prozessbeschreibung (MeMa / MaMa) mit ehrlicher Simulation.** |

---

## Kernaussage 1: Automatisierung mit gezielter Ausnahmebehandlung

### Der Ablauf in sechs Stufen

```mermaid
flowchart LR
    S1["1 · Anmeldung<br/>Excel / API"] --> S2["2 · Prüfung &<br/>Korrektur<br/>V01–V14"]
    S2 --> S3["3 · Aufbau vSZ<br/>10 Schritte<br/>PDF S. 2–9"]
    S3 --> S4["4 · Voraus-<br/>setzungen<br/>iMSys, Abmeldung, MCM"]
    S4 --> S5["5 · MeMa / MaMa<br/>→ RUHEND"]
    S5 --> S6["6 · Übergabe<br/>Beziehungsliste"]

    S2 -. "Befund" .-> W["Fallliste<br/>(Mensch entscheidet)"]
    S3 -. "Nachweis fehlt" .-> W
    S4 -. "Status fehlt" .-> W
    W -- "Entscheidung mit Begründung<br/>→ Audit-Log" --> R(["Automatisch<br/>weiterverarbeiten"])
    R -.-> S2

    classDef stage fill:#e8f1fb,stroke:#0a6ed1,color:#1d2d3e
    classDef human fill:#fff4e5,stroke:#e76500,color:#1d2d3e
    classDef auto fill:#eaf5ea,stroke:#256f3a,color:#1d2d3e
    class S1,S2,S3,S4,S5,S6 stage
    class W human
    class R auto
```

**Zum Sagen:** „Ein Befund stoppt nur die betroffene MaLo, nicht den ganzen Lauf. Alle anderen werden weiter umgestellt.“

### Beispiel aus dem echten Datensatz: Gebäude B-MUL-01

```mermaid
flowchart TD
    IN["B-MUL-01<br/>4 Haushalts-MaLos"] --> E{"Prüfung<br/>je MaLo"}
    E -->|"Teilnahme = Ja"| OK1["50539603921"]
    E -->|"Teilnahme = Ja"| OK2["50539603944"]
    E -->|"Teilnahme = Ja"| OK3["50539603000"]
    E -->|"Teilnahme = nein"| SK["50539603604"]

    OK1 --> SUC["✅ SUCCESS<br/>RUHEND"]
    OK2 --> SUC
    OK3 --> SUC
    SK --> SKP["⏭️ SKIPPED<br/>bleibt ACTIVE,<br/>keine Beziehung"]

    X["50539603888<br/>in B-FRA-01 UND B-CGN-01"] --> REV["⚠️ REVIEW<br/>keine Änderung,<br/>Mensch wählt Gebäude"]

    classDef ok fill:#eaf5ea,stroke:#256f3a,color:#1d2d3e
    classDef skip fill:#f2f2f2,stroke:#6a6d70,color:#1d2d3e
    classDef rev fill:#fff4e5,stroke:#e76500,color:#1d2d3e
    class SUC,OK1,OK2,OK3 ok
    class SK,SKP skip
    class X,REV rev
```

| Ergebnis | Bedeutung |
|---|---|
| ✅ `SUCCESS` | Simulierte Umstellung geschrieben **und** nachgelesen. |
| ⏭️ `SKIPPED` | Kein Teilnehmer, keine Änderung. |
| ⚠️ `REVIEW` | Identität mehrdeutig. Das System rät nicht. |
| ⛔ `BLOCKED` | Voraussetzung fehlt, z. B. vSZ nicht fertig. |
| 🔁 `ALREADY_DONE` | Wiederholung erkannt, kein doppelter Eintrag. |

**Zum Sagen:** „Manuell oder als Batch: Beides läuft über dieselbe Engine und liefert dasselbe Ergebnis. Ein zweiter Lauf ist sicher, weil nichts doppelt geschrieben wird.“

---

## Kernaussage 2: Fachlich korrekt und ehrlich

### Beziehungen genau nach Prozessbeschreibung (§6.1–§6.3)

```mermaid
flowchart LR
    H["Haushalts-MaLo<br/>(Teilnahme = Ja)"] -- "MaMa · §6.2<br/>mit Zeitscheibe" --> R["Reststrom-MaLo<br/>desselben Gebäudes"]
    R -- "MeMa · §6.1" --> M["Bezugs-MeLos<br/>aller Teilnehmer"]
    G["Einspeise-MaLo<br/>(Solar / Wind)"] -- "nur MeMa · §6.3<br/>KEINE MaMa" --> M
    G -. "erst nach MCM" .-> P["Voraussetzung"]

    classDef hh fill:#e8f1fb,stroke:#0a6ed1,color:#1d2d3e
    classDef rest fill:#eaf5ea,stroke:#256f3a,color:#1d2d3e
    classDef gen fill:#fff4e5,stroke:#e76500,color:#1d2d3e
    class H,M hh
    class R rest
    class G,P gen
```

| Gebäude | Reststrom-MaLo (aus Excel abgeleitet, nicht hart codiert) |
|---|---|
| `B-FRA-01` | `51781215544` |
| `B-CGN-01` | `51781215999` |
| `B-MUL-01` | `50539603639` |

Die Zeitscheiben sind halboffen: `[gültig ab, gültig bis)`. Überlappungen werden abgelehnt.

### Was echt ist und was simuliert

```mermaid
flowchart LR
    subgraph REAL["✅ Echt im MVP"]
        direction TB
        A1["Excel-Import<br/>17 Zeilen, 3 Gebäude"]
        A2["Prüfregeln & Engine"]
        A3["SQLite-Persistenz<br/>+ Audit-Log"]
        A4["Tests mit echtem<br/>PASS / FAIL"]
    end
    subgraph SIM["🧪 Simuliert / Annahme"]
        direction TB
        B1["SAP-Antworten"]
        B2["Marktstatus,<br/>vSZ-Bereitschaft"]
        B3["Status: ASSUMED_DEMO<br/>sichtbar markiert"]
    end
    subgraph NO["⛔ Bewusst nicht"]
        direction TB
        C1["Schreiben in SAP IS-U"]
        C2["UTILMD / INVOIC<br/>versenden"]
        C3["SapIsuAdapter =<br/>NOT_CONFIGURED"]
    end
    REAL --> SIM --> NO

    style REAL fill:#eaf5ea,stroke:#256f3a
    style SIM fill:#fff4e5,stroke:#e76500
    style NO fill:#fdecea,stroke:#bb0000
```

**Zum Sagen:** „Wir zeigen nie `SAP_VERIFIED`. Was nicht bewiesen ist, steht als `UNKNOWN` oder `ASSUMED_DEMO` da. Die SAP-Anbindung ist eine klar definierte Schnittstelle. Sie wird erst aktiviert, wenn Zugang, API und Berechtigungen bestätigt sind.“

---

## Abschluss in einem Satz

> **Das MVP stellt die MaLos automatisch, nachvollziehbar und wiederholbar auf ruhend um. Es stoppt nur bei echten Ausnahmen und behauptet nie mehr, als es beweisen kann.**
