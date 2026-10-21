# Spezialitätenliste · SL Browser

Eigenständiger deutscher Browser der amtlichen BAG-Publikation **01.10.2026** mit lokaler Sammlung und getrenntem Vergleich von Publikumspreis und Fabrikabgabepreis.

Geplante öffentliche Adresse: <https://wakuwakumiwaku.github.io/spezialitaetenliste/>. Die Anwendung ist unabhängig vom BAG. Die Veröffentlichung/Pages-Freischaltung erfolgt getrennt vom lokalen Build.

## Enthalten

- **10’352 Packungen / 6’749 Quellen-Präparate**, automatisch geladen, auch nach Neuladen. Keine Katalog-Upload-Schranke, Anmeldung, externen Schriftarten oder Laufzeit-API.
- SL **10’064**, GGSL **143**, GGML **145**; getrennte, quellengenaue Listenfilter.
- Normalisierte Suche nach Handelsname, Wirkstoff, ATC, GTIN und Swissmedic-Packungscode; Filter nach Anbieterin, ATC-Gruppe, Charakteristikum, Limitierung, fehlenden Preisen und Favoriten.
- Alle **6’340 Packungs-Limitierungszuordnungen** mit vollständigem deutschem XLSX-Originaltext, Zeilenbezug und Fristen. Ergänzende FHIR-Bedingungen/Metadaten bleiben im jeweiligen Packungs-/Bundle-Kontext einsehbar.
- Packungshierarchie, exakte Quellcodes, Preisänderungsdaten und sämtliche Originalspalten in den Details; Original-XLSX und verlustfrei komprimiertes Original-FHIR als Download.
- Favoriten, Packungsmengen, Positions- und Sammlungsnotizen, getrennte CHF-Teilsummen, JSON-/CSV-Sicherung und geprüfter Import mit Vorschau, Abbruch und Vorher-Sicherung; Druckansicht.
- Dunkle, kontrastreiche Oberfläche, umbruchfähige Drei-Katalog-Navigation, mobile Filteraufklappung und höchstens **40 gerenderte Katalogpackungen** pro Seite. Jede Packung bleibt erreichbar.

## Start und Prüfungen

Voraussetzungen: Node.js **22+**, Python **3.12+**. Keine Laufzeit- oder Importer-Paketabhängigkeiten, keine globalen Installationen.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm start
```

Lokal: <http://127.0.0.1:4174/spezialitaetenliste/>. `PORT` kann geändert werden. Der Server liefert ausschliesslich die Build-Allowlist unter dem echten Repository-Unterpfad, nicht das Projektverzeichnis. Nicht mit `file://` öffnen.

`npm run check` prüft Syntax und Hashes sämtlicher Datenartefakte; `npm test` prüft Berechnung, Speicherung, Importformate, Servergrenzen und den **vollständigen echten** XLSX/FHIR-Abgleich. Die Originaldaten sind bereits gebündelt; Build/Tests benötigen keinen Netzwerkzugriff.

Für native Browserprüfungen nach dem Build:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
BROWSER_EXECUTABLE=/path/to/firefox-or-camoufox \
node tests/browser.mjs
```

Der Test startet und beendet einen eigenen headless Firefox/Camoufox mit isolierten Kontexten. Berichte, echte Downloads und Screenshots landen ausschliesslich in `.local/browser/`. Native `setInputFiles` und Downloads werden geprüft, nicht ein Betriebssystem-Dateiauswahldialog. Der Druckaufruf wird im Test instrumentiert; die echte Druck-DOM wird geprüft.

## Daten reproduzieren

```sh
python3 scripts/acquire_sources.py
python3 scripts/import_catalog.py
npm run check
npm test
npm run build
```

Die Beschaffung prüft den festgehaltenen offiziellen Jahresarchiv-Hash und liest nur die beiden ausgewählten deutschen Mitglieder. Vorhandene passende Originale bleiben unangetastet; abweichende Originale werden nicht überschrieben. Der Import ist deterministisch und verwendet nur die Python-Standardbibliothek. Das grosse Jahresarchiv und das rohe FHIR bleiben unter dem ignorierten `sources/`; nicht veröffentlichen. Einzelheiten, Prüfsummen und Grenzen: [Datenherkunft](docs/DATA.md), [Codebasis](docs/CODEBASE.md).

## Wichtige Grenzen

Das aktuelle BAG-Ressourcen-API antwortete bei der Beschaffung zwar mit HTTP 200, enthielt aber keine nutzbaren Download-URLs. Deshalb wird ehrlich die **vollständige amtliche Archivpublikation vom 01.10.2026** verwendet, nicht ein behaupteter Live-Stand vom 21.10.2026.

Kein Dosierungs- oder Verschreibungswerkzeug, keine persönliche Versicherungs-/Selbstbehaltsberechnung, keine garantierte Vergütung. Gleicher ATC oder Wirkstoff beweist keine therapeutische Gleichwertigkeit. Ein Vergleich bezieht sich auf **Packungspreise**, nicht auf mg-/Einzelstückpreise. Fehlende Werte sind unbekannt, nicht null Franken; unvollständige Summen sind gekennzeichnet. Keine Patientendaten eintragen.

Sammlungen liegen nur in `sl.workspace.v1` im Browser. Beschädigte oder zwischen Registerkarten geänderte Rohdaten werden nicht automatisch überschrieben. Blockierter Speicher wird angezeigt; Exporte sind weiterhin möglich. Lokaler Browser-Speicher ist kein dauerhaftes Backup. JSON-/CSV-Exporte regelmässig sichern. Maximal 5’000 Positionen/Favoriten, Mengen 1–9’999 ganze Packungen, 5 MB serialisierter Zustand; Importdateien bis 12 MB. CSV enthält Original-Kennungen, Mengen, Notizen, Favoriten, Quellenstand und separate Einheitspreise in Rappen; Preisfelder werden bei einem Import geprüft, aber niemals als Katalogpreis übernommen.

Die enthaltenen amtlichen Daten bleiben dem BAG zugeordnet. Die Anwendung stellt keine weitergehende Datenlizenz, medizinische Empfehlung oder behördliche Zulassung in Aussicht.
