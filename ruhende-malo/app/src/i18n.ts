import { createContext, useContext } from 'react';

/**
 * German / English UI text. Market terms (MaLo, MeLo, MeMa, MaMa, Reststrom-MaLo, Ruhendstellung, vSZ,
 * Zeitscheibe) stay German in both languages because that is how the market and the process PDF use them.
 */
export type Lang = 'de' | 'en';

const de = {
  'app.subtitle': 'Umstellung auf ruhende MaLo',
  'nav.overview': 'Übersicht', 'nav.cases': 'Klärfälle', 'nav.log': 'Protokoll', 'nav.api': 'Schnittstelle',
  'ov.needs': 'Braucht Sie', 'ov.needs.none': 'Nichts offen', 'ov.needs.none.d': 'Alle Fälle sind geklärt.', 'ov.needs.all': 'Alle {n} Klärfälle', 'ov.lastrun': 'Letzte Prüfung {d}',
  'log.title': 'Protokoll', 'log.sub': 'Jede Aktion mit Zeitpunkt, Objekt, Auslöser und Begründung. Nur anhängend — nichts wird gelöscht.',
  'log.f.construct': 'Konstrukt', 'log.f.action': 'Aktion', 'log.f.search': 'MaLo, Begründung, Auslöser', 'log.f.all': 'Alle', 'log.f.checks': 'Automatische Prüfungen zeigen',
  'log.c.when': 'Zeitpunkt', 'log.c.what': 'Aktion', 'log.c.object': 'Objekt', 'log.c.who': 'Auslöser', 'log.c.why': 'Begründung',
  'log.empty': 'Keine Einträge.', 'log.construct': 'Verlauf dieses Konstrukts', 'log.all': 'Ganzes Protokoll →',
  'top.simulation': 'Simulation · keine SAP-Verbindung', 'top.simulation.short': 'Simulation',
  'menu.title': 'Demo', 'menu.selfcheck': 'Prüfszenarien ausführen', 'menu.import': 'Teilnehmerliste importieren', 'menu.reset': 'Demo zurücksetzen',
  'common.loading': 'Wird geladen…', 'common.cancel': 'Abbrechen', 'common.confirm': 'Bestätigen', 'common.close': 'Schließen', 'common.back': 'Zurück',
  'common.reason': 'Begründung', 'common.reason.placeholder': 'Wer hat was wann bestätigt?', 'common.reason.required': 'Bitte eine Begründung angeben.',
  'common.stichtag': 'Stichtag', 'common.reststrom': 'Reststrom-MaLo', 'common.melo': 'MeLo', 'common.malo': 'MaLo', 'common.einspeise': 'Einspeise-MaLo',
  'common.copied': 'Kopiert', 'common.open': 'Öffnen', 'common.details': 'Technische Details', 'common.since': 'seit {d}',
  'common.offline': 'Keine Verbindung zum Backend. Läuft `npm run dev`?',
  'role.Haushaltsverbrauch': 'Haushalt', 'role.Solaranlage': 'Solaranlage', 'role.Windkraftanlage': 'Windkraftanlage', 'role.Marktlokation Reststrom': 'Reststrom',

  'ov.title': 'Konstrukte', 'ov.sub': '{n} MK7-Konstrukte · Teilnehmer werden automatisch ruhend gestellt, Klärfälle landen bei Ihnen.',
  'ov.run': 'Prozess starten', 'ov.rerun': 'Erneut prüfen', 'ov.running': 'Läuft…',
  'ov.kpi.done': 'ruhend', 'ov.kpi.cases': 'Klärfälle offen', 'ov.kpi.rel': 'MeMa / MaMa gepflegt', 'ov.kpi.handover': 'Übergaben vorbereitet',
  'ov.card.cases': '{n} Klärfall · {n} Klärfälle', 'ov.card.nocases': 'Keine Klärfälle', 'ov.card.open': 'Konstrukt öffnen',
  'ov.activity': 'Zuletzt passiert', 'ov.activity.empty': 'Noch keine Aktivität. Starten Sie den Prozess.',
  'ov.result': '{done} neu ruhend · {already} bereits erledigt · {waiting} warten auf Klärung',
  'ov.result.none': 'Alles geprüft. Keine neuen Umstellungen.',

  'stage.ANMELDUNG': 'Anmeldung', 'stage.PRUEFUNG': 'Prüfung', 'stage.VSZ': 'Aufbau vSZ', 'stage.UMSTELLUNG': 'Umstellung', 'stage.UEBERGABE': 'Übergabe',

  'step.PRUEFUNG': 'Prüfung der Daten', 'step.VSZ': 'Aufbau vSZ', 'step.PREREQ': 'Voraussetzungen', 'step.MEMA': 'MeMa §6.1', 'step.MAMA': 'MaMa §6.2', 'step.RUHEND': 'Ruhend', 'step.UEBERGABE': 'Übergabe',
  'stepstate.OK': 'erfüllt', 'stepstate.DONE': 'erledigt', 'stepstate.TODO': 'geplant', 'stepstate.FAIL': 'Fehler', 'stepstate.WAIT': 'wartet', 'stepstate.SKIP': 'noch nicht erreicht', 'stepstate.NA': 'entfällt',

  'status.NEW': 'Angemeldet', 'status.READY': 'Bereit', 'status.DONE': 'Ruhend', 'status.DONE.gen': 'MeMa gepflegt', 'status.WAITING': 'Wartet auf Status',
  'status.DECISION': 'Entscheidung nötig', 'status.CORRECTION': 'Korrektur nötig', 'status.EXCLUDED': 'Ausgeschlossen', 'status.NOT_PARTICIPATING': 'Nimmt nicht teil', 'status.REACTIVATED': 'Wiederaktiviert',

  'co.back': 'Übersicht', 'co.continue': 'Prozess fortsetzen', 'co.participants': 'Teilnehmer', 'co.needs': 'Braucht Ihre Aufmerksamkeit', 'co.done': 'Erledigt', 'co.other': 'Weitere',
  'co.timeline': 'Ablauf nach Prozessbeschreibung',
  'co.s.anmeldung': 'Anmeldung Konstrukt', 'co.s.anmeldung.d': '{rows} Zeilen aus {src} · {hh} Haushalte, davon {part} teilnehmend',
  'co.s.pruefung': 'Prüfung der Daten', 'co.s.pruefung.ok': 'Keine offenen Befunde', 'co.s.pruefung.open': '{n} offene Befunde – Details bei den Teilnehmern', 'co.s.pruefung.not': 'Noch nicht geprüft',
  'co.s.vsz': 'Aufbau vSZ', 'co.s.vsz.d': '{done} von {total} Schritten bestätigt (PDF 1–4.7)', 'co.s.vsz.confirm': 'Offene Schritte bestätigen', 'co.s.vsz.evidence': 'Nachweis', 'co.s.vsz.evidence.ph': 'Geprüft im SAP-Testsystem am 14.10.2026',
  'co.s.mema': 'MeMa pflegen (§6.1)', 'co.s.mema.d': 'Reststrom-MaLo → Bezugs-MeLos · {n} Beziehungen',
  'co.s.mama': 'MaMa pflegen (§6.2)', 'co.s.mama.d': 'Bezugs-MaLo → Reststrom-MaLo mit Zeitscheibe · {n} Beziehungen',
  'co.s.einspeise': 'Einspeise-MeMa (§6.3)', 'co.s.einspeise.d': 'Nur MeMa, keine MaMa · {n} Beziehungen',
  'co.s.ruhend': 'Ruhendstellung', 'co.s.ruhend.d': '{done} von {total} teilnehmenden MaLos ruhend',
  'co.s.uebergabe': 'Übergabe', 'co.s.uebergabe.d': '{n} Ereignisse vorbereitet · nicht gesendet', 'co.s.csv': 'Beziehungsliste (§5) herunterladen',
  'co.rel.open': 'offen', 'co.rel.closed': 'beendet',

  'cases.title': 'Klärfälle', 'cases.sub': 'Was das System nicht allein entscheiden darf. Nach Ihrer Entscheidung läuft der Prozess automatisch weiter.',
  'cases.filter.all': 'Alle', 'cases.cat.DECISION': 'Entscheidung', 'cases.cat.CORRECTION': 'Daten korrigieren', 'cases.cat.STATUS': 'Wartet auf Status', 'cases.cat.VSZ': 'Aufbau vSZ',
  'cases.empty.title': 'Alles geklärt', 'cases.empty.body': 'Es gibt keine offenen Klärfälle. Neue Fälle erscheinen hier automatisch.',
  'cases.age': 'offen {d}',

  'case.what': 'Was ist los', 'case.progress': 'Fortschritt dieser MaLo', 'case.actions': 'Was Sie tun können', 'case.data': 'Stammdaten', 'case.rels': 'Beziehungen', 'case.periods': 'Zeitscheiben', 'case.history': 'Verlauf',
  'case.more': 'Weitere Aktionen', 'case.working': 'Wird übernommen und weiterverarbeitet…', 'case.done.title': 'Erledigt', 'case.done.ruhend': 'Die MaLo ist jetzt ruhend. MeMa und MaMa sind gepflegt.',
  'case.done.next': 'Übernommen. Neuer Stand: {s}.', 'case.fine': 'Für diese MaLo ist nichts zu tun.', 'case.notrun': 'Noch nicht geprüft. Starten Sie den Prozess auf der Übersicht.',
  'case.ready': 'Bereit für die Umstellung beim nächsten Lauf.',
  'case.status.input': 'Status erfassen', 'case.manual': 'Manuell bestätigen', 'case.exclude': 'Aus Konstrukt nehmen', 'case.fix': 'Korrigieren', 'case.fix.new': 'Neuer Wert',
  'case.choose': 'Gehört zu {c}', 'case.choose.q': 'Zu welchem Konstrukt gehört diese MaLo?', 'case.ack': 'Bestätigen, dass dies so gewollt ist',
  'case.si.V10': 'iMSys ist eingebaut', 'case.si.V11': 'Abmeldung liegt vor', 'case.si.V09': 'MCM-Prozess abgeschlossen',
  'case.si.hint': 'Entspricht einer Statusmeldung aus SAP / Marktkommunikation (POST /updateSapState).',
  'case.manual.hint': 'Manuelle Übersteuerung. Wird mit Ihrer Begründung protokolliert.',
  'case.melo.count': '{n} von 33 Zeichen', 'case.malo.count': '{n} von 11 Ziffern',

  'life.REACTIVATE': 'Wiederaktivieren', 'life.REMOVE_FROM_CONSTRUCT': 'Herauslösen', 'life.CORRECT_TRANSITION': 'Datum korrigieren', 'life.REVERSE_TRANSITION': 'Rücknahme',
  'life.REACTIVATE.d': 'Ruhend → aktiv ab Datum. Die ruhende Zeitscheibe bleibt in der Historie.',
  'life.REMOVE_FROM_CONSTRUCT.d': 'MeMa und MaMa enden zum Datum, die MaLo verlässt das Konstrukt.',
  'life.CORRECT_TRANSITION.d': 'Verschiebt das Datum einer früheren Umstellung. Das Original bleibt protokolliert.',
  'life.REVERSE_TRANSITION.d': 'Gleicht eine frühere Umstellung durch eine neue aus. Nichts wird gelöscht.',
  'life.date': 'Wirksam ab', 'life.ref': 'Bezieht sich auf', 'life.check': 'Prüfen', 'life.run': 'Ausführen', 'life.noref': 'Keine passende frühere Umstellung',

  'rule.V01': 'Pflichtangaben fehlen', 'rule.V02': 'ID-Format ungültig', 'rule.V03': 'Prüfziffer falsch', 'rule.V04': 'Reststrom-MaLo nicht eindeutig', 'rule.V05': 'MaLo in zwei Konstrukten',
  'rule.V06': 'MeLo doppelt zugeordnet', 'rule.V07': 'Teilnahme unklar', 'rule.V08': 'Einspeise-MaLo fehlt', 'rule.V09': 'MCM-Prozess nicht abgeschlossen', 'rule.V10': 'Kein iMSys an der MeLo',
  'rule.V11': 'Abmeldung des Lieferanten fehlt', 'rule.V12': 'Zeitscheiben-Konflikt', 'rule.V13': 'Kein teilnehmender Haushalt', 'rule.V14': 'Einspeise-MaLo mehrfach genutzt', 'rule.VSZ': 'Aufbau vSZ nicht bestätigt',
  'rule.V01.x': 'In der Teilnehmerliste fehlt eine MaLo, MeLo oder Rolle.',
  'rule.V02.x': 'Eine MeLo-ID hat 33 Zeichen (DE + 31), eine MaLo-ID 11 Ziffern. Diese ID passt nicht.',
  'rule.V04.x': 'Pro Konstrukt muss es genau eine Reststrom-MaLo geben. Bitte das Konstrukt neu anmelden.',
  'rule.V05.x': 'Dieselbe MaLo steht in zwei Gebäuden mit unterschiedlichen MeLos. Das System entscheidet das nie allein.',
  'rule.V06.x': 'Eine MeLo ist mehreren MaLos zugeordnet.',
  'rule.V07.x': '„Teilnahme MK7“ muss Ja oder nein sein.',
  'rule.V08.x': 'Für die Erzeugungsanlage fehlt die Einspeise-MaLo.',
  'rule.V09.x': 'Die Einspeise-MeMa wird erst nach Abschluss des MCM-Prozesses gepflegt (PDF §6.3).',
  'rule.V10.x': 'Für den virtuellen Summenzähler braucht jede teilnehmende MeLo ein iMSys.',
  'rule.V11.x': 'Solange der bisherige Lieferant die MaLo nicht abgemeldet hat, kann sie nicht ruhend werden.',
  'rule.V12.x': 'Die neue Zeitscheibe würde sich mit einer bestehenden überschneiden.',
  'rule.V13.x': 'Im Konstrukt nimmt kein Haushalt teil.',
  'rule.V14.x': 'Mehrere Konstrukte nutzen dieselbe Einspeise-MaLo. Bitte bestätigen, dass das gewollt ist.',
  'rule.VSZ.x': 'Die Schritte 1–4.7 aus der Prozessbeschreibung sind für dieses Konstrukt noch nicht bestätigt.',

  'act.SET_DORMANT': 'ruhend gestellt', 'act.MAINTAIN_EINSPEISE_MEMA': 'Einspeise-MeMa gepflegt', 'act.REACTIVATE': 'wiederaktiviert', 'act.REMOVE_FROM_CONSTRUCT': 'herausgelöst',
  'act.CORRECT_TRANSITION': 'Datum korrigiert', 'act.REVERSE_TRANSITION': 'zurückgenommen', 'act.RESOLVE_ISSUE': 'Klärfall entschieden', 'act.CONFIRM_VSZ': 'Aufbau vSZ bestätigt',
  'act.VALIDATE': 'Daten geprüft', 'act.REGISTER_CONSTRUCT': 'Konstrukt angemeldet', 'act.SAP_STATE_UPDATE': 'Statusmeldung eingegangen', 'act.SET_STICHTAG': 'Stichtag geändert',
  'actor.PIPELINE': 'Automatik', 'actor.DEMO_USER': 'Sie', 'actor.API_CLIENT': 'Schnittstelle', 'actor.RESET': 'Demo', 'actor.IMPORT': 'Import', 'actor.SYSTEM': 'System',

  'toast.reset': 'Demo zurückgesetzt. Die Teilnehmerliste ist neu angemeldet.', 'toast.imported': '{n} Zeilen importiert',
  'toast.selfcheck': '{p} von {t} Prüfszenarien bestanden', 'toast.vsz': 'Aufbau vSZ bestätigt — Prozess läuft weiter',
  'confirm.reset': 'Demo zurücksetzen?', 'confirm.reset.d': 'Alle simulierten Änderungen und der Verlauf werden gelöscht. Die Excel-Datei bleibt unverändert.',
  'confirm.import': '{f} importieren?', 'confirm.import.d': 'Ersetzt alle Konstrukte. Für hochgeladene Dateien ist der SAP-Status unbekannt, bis er gemeldet wird.',
  'confirm.life': '{op} für MaLo {m} ab {d}?', 'confirm.life.d': 'Simulierte Änderung in der lokalen Datenbank — keine SAP-Buchung.',
  'err.reason': 'Begründung fehlt', 'err.value': 'Bitte einen neuen Wert eingeben.',
  'api.title': 'Schnittstelle', 'api.sub': 'REST + JSON für andere Systeme. Die Oberfläche nutzt genau diese Schnittstelle.', 'api.try': 'Ausprobieren', 'api.spec': 'OpenAPI herunterladen',
};

const en: Record<keyof typeof de, string> = {
  'app.subtitle': 'Switching MaLos to ruhend',
  'nav.overview': 'Overview', 'nav.cases': 'Cases', 'nav.log': 'Log', 'nav.api': 'API',
  'ov.needs': 'Needs you', 'ov.needs.none': 'Nothing open', 'ov.needs.none.d': 'All cases are resolved.', 'ov.needs.all': 'All {n} cases', 'ov.lastrun': 'Last check {d}',
  'log.title': 'Log', 'log.sub': 'Every action with time, object, trigger and reason. Append-only — nothing is deleted.',
  'log.f.construct': 'Construct', 'log.f.action': 'Action', 'log.f.search': 'MaLo, reason, trigger', 'log.f.all': 'All', 'log.f.checks': 'Show automatic checks',
  'log.c.when': 'Time', 'log.c.what': 'Action', 'log.c.object': 'Object', 'log.c.who': 'Trigger', 'log.c.why': 'Reason',
  'log.empty': 'No entries.', 'log.construct': 'History of this construct', 'log.all': 'Full log →',
  'top.simulation': 'Simulation · no SAP connection', 'top.simulation.short': 'Simulation',
  'menu.title': 'Demo', 'menu.selfcheck': 'Run test scenarios', 'menu.import': 'Import participant list', 'menu.reset': 'Reset demo',
  'common.loading': 'Loading…', 'common.cancel': 'Cancel', 'common.confirm': 'Confirm', 'common.close': 'Close', 'common.back': 'Back',
  'common.reason': 'Reason', 'common.reason.placeholder': 'Who confirmed what, and when?', 'common.reason.required': 'Add a reason first.',
  'common.stichtag': 'Stichtag', 'common.reststrom': 'Reststrom-MaLo', 'common.melo': 'MeLo', 'common.malo': 'MaLo', 'common.einspeise': 'Einspeise-MaLo',
  'common.copied': 'Copied', 'common.open': 'Open', 'common.details': 'Technical details', 'common.since': 'since {d}',
  'common.offline': 'No connection to the backend. Is `npm run dev` running?',
  'role.Haushaltsverbrauch': 'Household', 'role.Solaranlage': 'Solar plant', 'role.Windkraftanlage': 'Wind turbine', 'role.Marktlokation Reststrom': 'Reststrom',

  'ov.title': 'Constructs', 'ov.sub': '{n} MK7 constructs · participants are set ruhend automatically, open cases come to you.',
  'ov.run': 'Start process', 'ov.rerun': 'Check again', 'ov.running': 'Running…',
  'ov.kpi.done': 'ruhend', 'ov.kpi.cases': 'open cases', 'ov.kpi.rel': 'MeMa / MaMa maintained', 'ov.kpi.handover': 'handovers prepared',
  'ov.card.cases': '{n} open case · {n} open cases', 'ov.card.nocases': 'No open cases', 'ov.card.open': 'Open construct',
  'ov.activity': 'Recent activity', 'ov.activity.empty': 'Nothing yet. Start the process.',
  'ov.result': '{done} newly ruhend · {already} already done · {waiting} waiting for a decision',
  'ov.result.none': 'Everything checked. No new switches.',

  'stage.ANMELDUNG': 'Registration', 'stage.PRUEFUNG': 'Validation', 'stage.VSZ': 'vSZ setup', 'stage.UMSTELLUNG': 'Switch', 'stage.UEBERGABE': 'Handover',

  'step.PRUEFUNG': 'Data validation', 'step.VSZ': 'vSZ setup', 'step.PREREQ': 'Prerequisites', 'step.MEMA': 'MeMa §6.1', 'step.MAMA': 'MaMa §6.2', 'step.RUHEND': 'Ruhend', 'step.UEBERGABE': 'Handover',
  'stepstate.OK': 'passed', 'stepstate.DONE': 'done', 'stepstate.TODO': 'planned', 'stepstate.FAIL': 'error', 'stepstate.WAIT': 'waiting', 'stepstate.SKIP': 'not reached', 'stepstate.NA': 'not applicable',

  'status.NEW': 'Registered', 'status.READY': 'Ready', 'status.DONE': 'Ruhend', 'status.DONE.gen': 'MeMa maintained', 'status.WAITING': 'Waiting for status',
  'status.DECISION': 'Decision needed', 'status.CORRECTION': 'Correction needed', 'status.EXCLUDED': 'Excluded', 'status.NOT_PARTICIPATING': 'Not participating', 'status.REACTIVATED': 'Reactivated',

  'co.back': 'Overview', 'co.continue': 'Continue process', 'co.participants': 'Participants', 'co.needs': 'Needs your attention', 'co.done': 'Done', 'co.other': 'Other',
  'co.timeline': 'Steps per process description',
  'co.s.anmeldung': 'Construct registration', 'co.s.anmeldung.d': '{rows} rows from {src} · {hh} households, {part} participating',
  'co.s.pruefung': 'Data validation', 'co.s.pruefung.ok': 'No open findings', 'co.s.pruefung.open': '{n} open findings – see participants', 'co.s.pruefung.not': 'Not validated yet',
  'co.s.vsz': 'vSZ setup', 'co.s.vsz.d': '{done} of {total} steps confirmed (PDF 1–4.7)', 'co.s.vsz.confirm': 'Confirm open steps', 'co.s.vsz.evidence': 'Evidence', 'co.s.vsz.evidence.ph': 'Checked in the SAP test system on 14.10.2026',
  'co.s.mema': 'Maintain MeMa (§6.1)', 'co.s.mema.d': 'Reststrom-MaLo → Bezugs-MeLos · {n} relationships',
  'co.s.mama': 'Maintain MaMa (§6.2)', 'co.s.mama.d': 'Bezugs-MaLo → Reststrom-MaLo with Zeitscheibe · {n} relationships',
  'co.s.einspeise': 'Einspeise-MeMa (§6.3)', 'co.s.einspeise.d': 'MeMa only, no MaMa · {n} relationships',
  'co.s.ruhend': 'Ruhendstellung', 'co.s.ruhend.d': '{done} of {total} participating MaLos ruhend',
  'co.s.uebergabe': 'Handover', 'co.s.uebergabe.d': '{n} events prepared · not sent', 'co.s.csv': 'Download relationship list (§5)',
  'co.rel.open': 'open', 'co.rel.closed': 'ended',

  'cases.title': 'Cases', 'cases.sub': 'What the system may not decide on its own. After your decision the process continues automatically.',
  'cases.filter.all': 'All', 'cases.cat.DECISION': 'Decision', 'cases.cat.CORRECTION': 'Fix data', 'cases.cat.STATUS': 'Waiting for status', 'cases.cat.VSZ': 'vSZ setup',
  'cases.empty.title': 'All clear', 'cases.empty.body': 'There are no open cases. New cases appear here automatically.',
  'cases.age': 'open {d}',

  'case.what': "What's going on", 'case.progress': 'Progress of this MaLo', 'case.actions': 'What you can do', 'case.data': 'Master data', 'case.rels': 'Relationships', 'case.periods': 'Zeitscheiben', 'case.history': 'History',
  'case.more': 'More actions', 'case.working': 'Applying and continuing…', 'case.done.title': 'Done', 'case.done.ruhend': 'The MaLo is ruhend now. MeMa and MaMa are maintained.',
  'case.done.next': 'Applied. New status: {s}.', 'case.fine': 'Nothing to do for this MaLo.', 'case.notrun': 'Not validated yet. Start the process on the overview.',
  'case.ready': 'Ready for the switch in the next run.',
  'case.status.input': 'Record status', 'case.manual': 'Confirm manually', 'case.exclude': 'Remove from construct', 'case.fix': 'Correct', 'case.fix.new': 'New value',
  'case.choose': 'Belongs to {c}', 'case.choose.q': 'Which construct does this MaLo belong to?', 'case.ack': 'Confirm this is intended',
  'case.si.V10': 'iMSys is installed', 'case.si.V11': 'Deregistration received', 'case.si.V09': 'MCM process completed',
  'case.si.hint': 'Same as a status message from SAP / market communication (POST /updateSapState).',
  'case.manual.hint': 'Manual override. Logged with your reason.',
  'case.melo.count': '{n} of 33 characters', 'case.malo.count': '{n} of 11 digits',

  'life.REACTIVATE': 'Reactivate', 'life.REMOVE_FROM_CONSTRUCT': 'Remove from construct', 'life.CORRECT_TRANSITION': 'Correct date', 'life.REVERSE_TRANSITION': 'Reverse',
  'life.REACTIVATE.d': 'Ruhend → active from the date. The dormant Zeitscheibe stays in the history.',
  'life.REMOVE_FROM_CONSTRUCT.d': 'MeMa and MaMa end on the date and the MaLo leaves the construct.',
  'life.CORRECT_TRANSITION.d': 'Moves the date of an earlier switch. The original stays in the log.',
  'life.REVERSE_TRANSITION.d': 'Compensates an earlier switch with a new one. Nothing is deleted.',
  'life.date': 'Effective from', 'life.ref': 'Refers to', 'life.check': 'Check', 'life.run': 'Execute', 'life.noref': 'No matching earlier switch',

  'rule.V01': 'Required data missing', 'rule.V02': 'Invalid ID format', 'rule.V03': 'Wrong check digit', 'rule.V04': 'Reststrom-MaLo not unique', 'rule.V05': 'MaLo in two constructs',
  'rule.V06': 'MeLo assigned twice', 'rule.V07': 'Participation unclear', 'rule.V08': 'Einspeise-MaLo missing', 'rule.V09': 'MCM process not completed', 'rule.V10': 'No iMSys at the MeLo',
  'rule.V11': 'Supplier deregistration missing', 'rule.V12': 'Zeitscheibe conflict', 'rule.V13': 'No participating household', 'rule.V14': 'Einspeise-MaLo shared', 'rule.VSZ': 'vSZ setup not confirmed',
  'rule.V01.x': 'A MaLo, MeLo or role is missing in the participant list.',
  'rule.V02.x': 'A MeLo ID has 33 characters (DE + 31), a MaLo ID has 11 digits. This ID does not fit.',
  'rule.V04.x': 'Each construct needs exactly one Reststrom-MaLo. Register the construct again.',
  'rule.V05.x': 'The same MaLo is listed in two buildings with different MeLos. The system never decides this on its own.',
  'rule.V06.x': 'One MeLo is assigned to several MaLos.',
  'rule.V07.x': '“Teilnahme MK7” must be Ja or nein.',
  'rule.V08.x': 'The generation plant has no Einspeise-MaLo.',
  'rule.V09.x': 'The Einspeise-MeMa is maintained only after the MCM process is completed (PDF §6.3).',
  'rule.V10.x': 'A virtual summation meter needs an iMSys at every participating MeLo.',
  'rule.V11.x': 'As long as the current supplier has not deregistered the MaLo, it cannot become ruhend.',
  'rule.V12.x': 'The new Zeitscheibe would overlap an existing one.',
  'rule.V13.x': 'No household participates in the construct.',
  'rule.V14.x': 'Several constructs use the same Einspeise-MaLo. Confirm that this is intended.',
  'rule.VSZ.x': 'Steps 1–4.7 of the process description are not confirmed for this construct yet.',

  'act.SET_DORMANT': 'set ruhend', 'act.MAINTAIN_EINSPEISE_MEMA': 'Einspeise-MeMa maintained', 'act.REACTIVATE': 'reactivated', 'act.REMOVE_FROM_CONSTRUCT': 'removed from construct',
  'act.CORRECT_TRANSITION': 'date corrected', 'act.REVERSE_TRANSITION': 'reversed', 'act.RESOLVE_ISSUE': 'case decided', 'act.CONFIRM_VSZ': 'vSZ setup confirmed',
  'act.VALIDATE': 'data validated', 'act.REGISTER_CONSTRUCT': 'construct registered', 'act.SAP_STATE_UPDATE': 'status message received', 'act.SET_STICHTAG': 'Stichtag changed',
  'actor.PIPELINE': 'Automation', 'actor.DEMO_USER': 'You', 'actor.API_CLIENT': 'API', 'actor.RESET': 'Demo', 'actor.IMPORT': 'Import', 'actor.SYSTEM': 'System',

  'toast.reset': 'Demo reset. The participant list is registered again.', 'toast.imported': '{n} rows imported',
  'toast.selfcheck': '{p} of {t} test scenarios passed', 'toast.vsz': 'vSZ setup confirmed — process continues',
  'confirm.reset': 'Reset the demo?', 'confirm.reset.d': 'All simulated changes and the history are deleted. The Excel file is not changed.',
  'confirm.import': 'Import {f}?', 'confirm.import.d': 'Replaces all constructs. For uploaded files the SAP status is unknown until it is reported.',
  'confirm.life': '{op} for MaLo {m} from {d}?', 'confirm.life.d': 'Simulated change in the local database — no SAP posting.',
  'err.reason': 'Reason missing', 'err.value': 'Enter a new value.',
  'api.title': 'API', 'api.sub': 'REST + JSON for other systems. This UI uses exactly this API.', 'api.try': 'Try it', 'api.spec': 'Download OpenAPI',
};

export type Key = keyof typeof de;
const DICT: Record<Lang, Record<Key, string>> = { de, en };

export function translate(lang: Lang, key: Key | string, params: Record<string, string | number> = {}): string {
  let text = DICT[lang][key as Key] ?? DICT.de[key as Key] ?? key;
  // "singular · plural" pairs are chosen by the {n} parameter.
  if (text.includes(' · ') && 'n' in params && text.split(' · ').length === 2 && text.split(' · ').every((p) => p.includes('{n}'))) {
    text = text.split(' · ')[Number(params.n) === 1 ? 0 : 1];
  }
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export const I18nContext = createContext<{ lang: Lang; t: (key: Key | string, params?: Record<string, string | number>) => string; setLang: (l: Lang) => void }>({
  lang: 'de', t: (k) => String(k), setLang: () => undefined,
});
export const useI18n = () => useContext(I18nContext);

export const fmtDate = (lang: Lang, d?: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—');
export const fmtDateTime = (lang: Lang, t: string) => new Date(t).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export function relTime(lang: Lang, t: string): string {
  const diff = (Date.now() - new Date(t).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}
