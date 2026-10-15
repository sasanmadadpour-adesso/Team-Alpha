"""Import Dataset_English.xlsx into deterministic CAP CSV seed files.

The script intentionally uses only the Python standard library so the demo can
be rebuilt without adding a Python package manager to the project.
"""

from __future__ import annotations

import csv
import math
import re
import uuid
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Dataset_English.xlsx"
OUT = ROOT / "db" / "data"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = {"p": "http://schemas.openxmlformats.org/package/2006/relationships"}
UUID_NAMESPACE = uuid.UUID("e7d81f91-c2ce-4a95-a8fd-ec15e703be81")


def stable_uuid(*parts: object) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, "|".join(map(str, parts))))


def normalize_text(value: str) -> str:
    replacements = {
        "K�ln": "Köln",
        "M�llheim": "Mülheim",
        "Stra�e": "Straße",
        "Vilbelerlandstr�": "Vilbeler Landstraße",
        "Vilbelerlandstrß": "Vilbeler Landstraße",
    }
    value = value.strip()
    for broken, corrected in replacements.items():
        value = value.replace(broken, corrected)
    return re.sub(r"\s+", " ", value)


def excel_datetime(value: str) -> str:
    if not value:
        return ""
    dt = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(days=float(value))
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def decimal(value: str) -> Decimal:
    return Decimal(value or "0")


def money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def quantity(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def read_workbook(path: Path) -> dict[str, list[dict[str, str]]]:
    with ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.iter(f"{{{NS['m']}}}t"))
                for item in root.findall("m:si", NS)
            ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rels.findall("p:Relationship", REL_NS)
        }
        result: dict[str, list[dict[str, str]]] = {}

        for sheet in workbook.find("m:sheets", NS):
            target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            sheet_xml = ET.fromstring(archive.read(target))
            matrix: list[list[str]] = []
            for xml_row in sheet_xml.findall(".//m:sheetData/m:row", NS):
                row: list[str] = []
                for cell in xml_row.findall("m:c", NS):
                    letters = "".join(filter(str.isalpha, cell.attrib["r"]))
                    index = 0
                    for letter in letters:
                        index = index * 26 + ord(letter) - 64
                    while len(row) < index:
                        row.append("")
                    kind = cell.attrib.get("t")
                    raw = cell.find("m:v", NS)
                    inline = cell.find("m:is", NS)
                    value = ""
                    if kind == "s" and raw is not None:
                        value = shared[int(raw.text)]
                    elif kind == "inlineStr" and inline is not None:
                        value = "".join(
                            node.text or "" for node in inline.iter(f"{{{NS['m']}}}t")
                        )
                    elif raw is not None:
                        value = raw.text or ""
                    row[index - 1] = normalize_text(value)
                matrix.append(row)

            if not matrix:
                continue
            headers = matrix[0]
            result[sheet.attrib["name"]] = [
                dict(zip(headers, row + [""] * (len(headers) - len(row))))
                for row in matrix[1:]
            ]
        return result


def write_csv(entity: str, columns: list[str], rows: list[dict[str, object]]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"vnb.network-{entity}.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    sheets = read_workbook(SOURCE)
    participants = sheets["MK7 Participants"]
    consumption = sheets["Hourly Consumption"]
    generation = sheets["Hourly Generation"]
    pricing = sheets["Energy Pricing"]
    producers = sheets["Producer Onboarding"]

    producer_by_melo = {row["market_location_identifier"]: row for row in producers}
    participant_by_melo = {row["metering_location_id_MeLo"]: row for row in participants}
    prices = {excel_datetime(row["start_time"]): row for row in pricing}

    building_rows: list[dict[str, object]] = []
    for building_id in sorted({row["building_id"] for row in participants}):
        group = [row for row in participants if row["building_id"] == building_id]
        first = group[0]
        producer = next(
            (producer_by_melo[row["metering_location_id_MeLo"]] for row in group if row["metering_location_id_MeLo"] in producer_by_melo),
            {},
        )
        postal_match = re.search(r"(\d{5})$", first["city_postal_code"])
        building_rows.append({
            "ID": building_id,
            "city": first["city"],
            "postalCode": postal_match.group(1) if postal_match else "",
            "streetAddress": first["street_address"],
            "operatorName": first["mk7_operator"],
            "latitude": producer.get("plant_specifics.latitude", ""),
            "longitude": producer.get("plant_specifics.longitude", ""),
        })

    constructs: list[dict[str, object]] = []
    issues: list[dict[str, object]] = []
    role_labels = {
        "Household Consumption": "Haushaltsverbrauch / Household consumption",
        "Residual Supply Market Location": "Reststromversorgung / Residual supply",
        "Solar Plant": "Solaranlage / Solar plant",
        "Wind Plant": "Windanlage / Wind plant",
    }
    role_codes = {
        "Household Consumption": "HOUSEHOLD",
        "Residual Supply Market Location": "RESIDUAL",
        "Solar Plant": "SOLAR",
        "Wind Plant": "WIND",
    }

    for source_row, row in enumerate(participants, start=2):
        melo = row["metering_location_id_MeLo"]
        import_malo = row["market_location_id_import_MaLo"]
        export_malo = row["market_location_id_export_MaLo"]
        role = row["mk7_role"]
        is_plant = role in ("Solar Plant", "Wind Plant")
        has_dual = bool(import_malo and export_malo)
        construct_id = stable_uuid("construct", melo)
        source_conflict = is_plant and melo in producer_by_melo
        warning_text = ""
        warning_code = ""
        if source_conflict:
            warning_code = "ID_SEMANTIC_CONFLICT"
            warning_text = (
                "Quellkonflikt: Dieselbe DE-ID ist in 'Producer Onboarding' als MaLo und "
                "in 'MK7 Participants' als MeLo bezeichnet. / Source conflict: the same "
                "DE identifier is labelled MaLo in Producer Onboarding and MeLo in MK7 Participants."
            )
            issues.append({
                "ID": stable_uuid("issue", melo, "semantic"),
                "construct_ID": construct_id,
                "severityCode": "WARNING",
                "fieldName": "market_location_identifier",
                "sourceValue": melo,
                "issueText": warning_text,
            })
        primary_malo = import_malo or export_malo
        direction = "BIDIRECTIONAL" if has_dual else "GENERATION" if export_malo else "RESIDUAL" if role == "Residual Supply Market Location" else "CONSUMPTION"
        participation_yes = row["Teilnahme MK7"].lower() == "ja"
        display_name = f"{role_labels.get(role, role)} · {row['city']}"
        constructs.append({
            "ID": construct_id,
            "displayName": display_name,
            "primaryMaLo": primary_malo,
            "importMaLo": import_malo,
            "exportMaLo": export_malo,
            "meLo": melo,
            "city": row["city"],
            "streetAddress": row["street_address"],
            "meterNumber": row["meter_number"],
            "roleCode": role_codes.get(role, "OTHER"),
            "roleLabel": role_labels.get(role, role),
            "directionCode": direction,
            "participationCode": "YES" if participation_yes else "NO",
            "participationLabel": "Ja / Yes" if participation_yes else "Nein / No",
            "isEligible": str(role == "Household Consumption" and participation_yes).lower(),
            "hasDualMaLo": str(has_dual).lower(),
            "hasDataWarning": str(source_conflict).lower(),
            "warningCode": warning_code,
            "warningText": warning_text,
            "meteringSystem": row["metering_system"],
            "meteringOperator": row["metering_operator"],
            "mk7Operator": row["mk7_operator"],
            "supplyStart": excel_datetime(row["mk7_supply_start_utc"]),
            "contractStart": excel_datetime(row["contract_start_utc"]),
            "contractEnd": excel_datetime(row["contract_end_utc"]),
            "sourceRow": source_row,
            "building_ID": row["building_id"],
        })

    consumption_by_building_hour: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    generation_by_building_hour: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    consumption_by_melo_hour: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    generation_by_melo_hour: dict[tuple[str, str], Decimal] = defaultdict(Decimal)

    for row in consumption:
        master = participant_by_melo[row["metering_location_id_MeLo"]]
        eligible = master["mk7_role"] == "Household Consumption" and master["Teilnahme MK7"].lower() == "ja"
        start = excel_datetime(row["start_time"])
        amount = decimal(row["consumption_kwh"])
        consumption_by_melo_hour[(row["metering_location_id_MeLo"], start)] += amount
        if eligible:
            consumption_by_building_hour[(row["building_id"], start)] += amount

    for row in generation:
        start = excel_datetime(row["start_time"])
        amount = decimal(row["generation_kwh"])
        generation_by_building_hour[(row["building_id"], start)] += amount
        # This source column is named MaLo, but its values join to MK7 MeLo IDs.
        generation_by_melo_hour[(row["market_location_id_MaLo"], start)] += amount

    profile_rows: list[dict[str, object]] = []
    hourly_rows: list[dict[str, object]] = []
    all_starts = sorted(prices)
    for building in building_rows:
        building_id = str(building["ID"])
        for start in all_starts:
            consumed = consumption_by_building_hour[(building_id, start)]
            generated = generation_by_building_hour[(building_id, start)]
            local = min(consumed, generated)
            residual = max(Decimal(0), consumed - generated)
            export = max(Decimal(0), generated - consumed)
            profile_rows.append({
                "ID": stable_uuid("profile", building_id, start),
                "building_ID": building_id,
                "startTime": start,
                "hourLabel": start[11:16],
                "consumptionKwh": quantity(consumed),
                "generationKwh": quantity(generated),
                "localEnergyKwh": quantity(local),
                "residualGridKwh": quantity(residual),
                "exportKwh": quantity(export),
                "marketPriceEurKwh": prices[start]["market_price_eur_kwh"],
            })

    construct_lookup = {row["meLo"]: row for row in constructs}
    for construct in constructs:
        melo = str(construct["meLo"])
        building_id = str(construct["building_ID"])
        role = str(construct["roleCode"])
        eligible = construct["isEligible"] == "true"
        for start in all_starts:
            building_consumption = consumption_by_building_hour[(building_id, start)]
            building_generation = generation_by_building_hour[(building_id, start)]
            building_local = min(building_consumption, building_generation)
            own_consumption = consumption_by_melo_hour[(melo, start)]
            own_generation = generation_by_melo_hour[(melo, start)]
            if eligible and building_consumption:
                local_allocation = building_local * own_consumption / building_consumption
                residual = max(Decimal(0), own_consumption - local_allocation)
            elif role in ("SOLAR", "WIND"):
                local_allocation = building_local
                residual = Decimal(0)
            elif role == "RESIDUAL":
                own_consumption = building_consumption
                own_generation = building_generation
                local_allocation = building_local
                residual = max(Decimal(0), building_consumption - building_generation)
            else:
                local_allocation = Decimal(0)
                residual = own_consumption
            export = max(Decimal(0), own_generation - building_consumption) if role in ("SOLAR", "WIND") else Decimal(0)
            hourly_rows.append({
                "ID": stable_uuid("hourly", melo, start),
                "construct_ID": construct["ID"],
                "startTime": start,
                "hourLabel": start[11:16],
                "consumptionKwh": quantity(own_consumption),
                "generationKwh": quantity(own_generation),
                "localAllocationKwh": quantity(local_allocation),
                "residualGridKwh": quantity(residual),
                "exportKwh": quantity(export),
                "marketPriceEurKwh": prices[start]["market_price_eur_kwh"],
            })

    hourly_by_construct: dict[str, list[dict[str, object]]] = defaultdict(list)
    for item in hourly_rows:
        hourly_by_construct[str(item["construct_ID"])].append(item)
    for construct in constructs:
        values = hourly_by_construct[str(construct["ID"])]
        construct["totalConsumptionKwh"] = quantity(sum((decimal(str(item["consumptionKwh"])) for item in values), Decimal(0)))
        construct["totalGenerationKwh"] = quantity(sum((decimal(str(item["generationKwh"])) for item in values), Decimal(0)))
        construct["localEnergyKwh"] = quantity(sum((decimal(str(item["localAllocationKwh"])) for item in values), Decimal(0)))
        construct["residualGridKwh"] = quantity(sum((decimal(str(item["residualGridKwh"])) for item in values), Decimal(0)))
        construct["exportKwh"] = quantity(sum((decimal(str(item["exportKwh"])) for item in values), Decimal(0)))

    profiles_by_building: dict[str, list[dict[str, object]]] = defaultdict(list)
    for profile in profile_rows:
        profiles_by_building[str(profile["building_ID"])].append(profile)

    payment_rows: list[dict[str, object]] = []
    price0 = pricing[0]

    def add_payment(construct: dict[str, object], code: str, label: str, payer: str, recipient: str, qty: Decimal, unit: str, rate: Decimal, amount: Decimal, direction: str) -> None:
        payment_rows.append({
            "ID": stable_uuid("payment", construct["ID"], code),
            "construct_ID": construct["ID"],
            "paymentTypeCode": code,
            "paymentTypeLabel": label,
            "payer": payer,
            "recipient": recipient,
            "quantity": quantity(qty),
            "unit": unit,
            "rate": str(rate),
            "amount": money(amount),
            "directionCode": direction,
        })

    for construct in constructs:
        building_id = str(construct["building_ID"])
        role = str(construct["roleCode"])
        melo = str(construct["meLo"])
        profile = profiles_by_building[building_id]
        if construct["isEligible"] == "true":
            total = sum((consumption_by_melo_hour[(melo, start)] for start in all_starts), Decimal(0))
            rate = decimal(price0["retail_price_eur_kwh"])
            add_payment(construct, "PARTICIPANT_BILL", "Teilnehmerstromrechnung / Participant electricity bill", "Teilnehmer / Participant", "Mieterstromlieferant / Mieterstrom supplier", total, "kWh", rate, total * rate, "OUTGOING")
        elif role in ("SOLAR", "WIND"):
            local = sum((decimal(str(row["localEnergyKwh"])) for row in profile), Decimal(0))
            exported = sum((decimal(str(row["exportKwh"])) for row in profile), Decimal(0))
            purchase_rate = decimal(price0["plant_purchase_price_eur_kwh"])
            export_rate = decimal(price0["export_remuneration_eur_kwh"])
            add_payment(construct, "LOCAL_PURCHASE", "Lokaler Stromeinkauf / Local electricity purchase", "Mieterstromlieferant / Mieterstrom supplier", "Anlagenbetreiber / Plant operator", local, "kWh", purchase_rate, local * purchase_rate, "INCOMING")
            add_payment(construct, "EXPORT_REMUNERATION", "Einspeisevergütung / Export remuneration", "DSK GmbH", "Anlagenbetreiber / Plant operator", exported, "kWh", export_rate, exported * export_rate, "INCOMING")
            if role == "SOLAR":
                subsidy_rate = decimal(price0["mieterstrom_subsidy_eur_kwh"])
                add_payment(construct, "SOLAR_SUBSIDY", "Mieterstromzuschlag (Demo) / Mieterstrom subsidy", "DSK GmbH", "Anlagenbetreiber / Plant operator", local, "kWh", subsidy_rate, local * subsidy_rate, "INCOMING")
        elif role == "RESIDUAL":
            residual_cost = sum(
                (decimal(str(row["residualGridKwh"])) * decimal(str(row["marketPriceEurKwh"])) for row in profile),
                Decimal(0),
            )
            residual_qty = sum((decimal(str(row["residualGridKwh"])) for row in profile), Decimal(0))
            effective_rate = residual_cost / residual_qty if residual_qty else Decimal(0)
            add_payment(construct, "RESIDUAL_PROCUREMENT", "Reststrombeschaffung / Residual electricity procurement", "Mieterstromlieferant / Mieterstrom supplier", "DSK GmbH", residual_qty, "kWh", effective_rate, residual_cost, "OUTGOING")
            eligible_count = sum(1 for item in constructs if item["building_ID"] == building_id and item["isEligible"] == "true")
            meter_rate = decimal(price0["metering_fee_eur_per_meter_24h"])
            add_payment(construct, "METERING_SERVICE", "Messdienstleistung / Metering service", "Mieterstromlieferant / Mieterstrom supplier", "Tawanir", Decimal(eligible_count), "meter/24h", meter_rate, Decimal(eligible_count) * meter_rate, "OUTGOING")

    for construct in constructs:
        related = [item for item in payment_rows if item["construct_ID"] == construct["ID"]]
        balance = sum(
            (decimal(str(item["amount"])) * (Decimal(1) if item["directionCode"] == "INCOMING" else Decimal(-1)) for item in related),
            Decimal(0),
        )
        construct["paymentBalanceEur"] = money(balance)

    total_consumption = sum((decimal(str(row["consumptionKwh"])) for row in profile_rows), Decimal(0))
    total_generation = sum((decimal(str(row["generationKwh"])) for row in profile_rows), Decimal(0))
    total_local = sum((decimal(str(row["localEnergyKwh"])) for row in profile_rows), Decimal(0))
    total_residual = sum((decimal(str(row["residualGridKwh"])) for row in profile_rows), Decimal(0))
    total_export = sum((decimal(str(row["exportKwh"])) for row in profile_rows), Decimal(0))
    summary = [{
        "ID": "ALL",
        "buildingCount": len(building_rows),
        "constructCount": len(constructs),
        "eligibleMeterCount": sum(item["isEligible"] == "true" for item in constructs),
        "warningCount": sum(item["hasDataWarning"] == "true" for item in constructs),
        "consumptionKwh": quantity(total_consumption),
        "generationKwh": quantity(total_generation),
        "localEnergyKwh": quantity(total_local),
        "residualGridKwh": quantity(total_residual),
        "exportKwh": quantity(total_export),
        "localCoveragePercent": str((total_local / total_consumption * 100).quantize(Decimal("0.1"))) if total_consumption else "0.0",
    }]

    write_csv("Buildings", ["ID", "city", "postalCode", "streetAddress", "operatorName", "latitude", "longitude"], building_rows)
    write_csv("Constructs", ["ID", "displayName", "primaryMaLo", "importMaLo", "exportMaLo", "meLo", "city", "streetAddress", "meterNumber", "roleCode", "roleLabel", "directionCode", "participationCode", "participationLabel", "isEligible", "hasDualMaLo", "hasDataWarning", "warningCode", "warningText", "totalConsumptionKwh", "totalGenerationKwh", "localEnergyKwh", "residualGridKwh", "exportKwh", "paymentBalanceEur", "meteringSystem", "meteringOperator", "mk7Operator", "supplyStart", "contractStart", "contractEnd", "sourceRow", "building_ID"], constructs)
    write_csv("BuildingHourlyProfiles", ["ID", "building_ID", "startTime", "hourLabel", "consumptionKwh", "generationKwh", "localEnergyKwh", "residualGridKwh", "exportKwh", "marketPriceEurKwh"], profile_rows)
    write_csv("ConstructHourlyValues", ["ID", "construct_ID", "startTime", "hourLabel", "consumptionKwh", "generationKwh", "localAllocationKwh", "residualGridKwh", "exportKwh", "marketPriceEurKwh"], hourly_rows)
    write_csv("Payments", ["ID", "construct_ID", "paymentTypeCode", "paymentTypeLabel", "payer", "recipient", "quantity", "unit", "rate", "amount", "directionCode"], payment_rows)
    write_csv("DataQualityIssues", ["ID", "construct_ID", "severityCode", "fieldName", "sourceValue", "issueText"], issues)
    write_csv("PortfolioSummary", ["ID", "buildingCount", "constructCount", "eligibleMeterCount", "warningCount", "consumptionKwh", "generationKwh", "localEnergyKwh", "residualGridKwh", "exportKwh", "localCoveragePercent"], summary)
    print(f"Imported {len(constructs)} constructs, {len(hourly_rows)} construct-hours, and {len(payment_rows)} payments.")


if __name__ == "__main__":
    main()
