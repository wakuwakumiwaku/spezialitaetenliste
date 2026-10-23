# Codebasis und Verträge

## Aufbau

| Pfad | Aufgabe |
|---|---|
| `index.html` | Zugängliche deutsche Oberfläche, relative Assets, CSP, Dialoge und Drei-Katalog-Navigation |
| `src/app.js` | Sichere DOM-Erzeugung mit `textContent`, Suche, Details, Sammlung, Datei- und Druckinteraktionen |
| `src/domain.js` | Einmaliger Suchindex/Lookup-Maps, vorsortierte Preisfolgen, Singleton-Collator/Formatierer, BigInt-Rappenrechnung, strikte Zustands-/CSV-Prüfung und Speicherschutz |
| `src/catalog.js` | Same-origin JSON-Lader; explizite gzip-Dateien via `DecompressionStream`, JSON-Fallback; gemeinsame laufende/gecachte Reads |
| `src/styles.css` | Charcoal/Violett, near-white Text, grössenstabile umbruchfähige Smartphone-/Desktopansicht, helle Druckansicht |
| `scripts/import_catalog.py` | Deterministischer Standardbibliotheks-Importer für das tatsächlich untersuchte XLSX/FHIR-Schema |
| `scripts/acquire_sources.py` | Ausschliesslich gepinnte Originale beschaffen, abweichende bestehende Bytes nicht überschreiben |
| `scripts/verify-data.mjs` | Hash-/Grössen-/gzip-/Originalintegrität aller gebündelten Daten |
| `scripts/files.mjs`, `build.mjs` | Explizite Build-Allowlist; nur Laufzeitdateien und dokumentierte amtliche Daten nach `dist/` |
| `scripts/serve.mjs` | Exportiertes `createAppServer`, Loopback, Host-/Pfad-/Methodengrenzen und Repository-Unterpfad |
| `tests/*.test.mjs` | Domain-/Such-/Speicher-/Export-/Serverregressionen, echte Katalogdaten |
| `tests/test_import_catalog.py` | Jede echte XLSX-Packungszeile und jede Limitierungszeile, Original-FHIR-Stream und unabhängige Zählkontrollen |
| `tests/browser.mjs` | Isolierte native Browser-Akzeptanz, alle Seiten/Packungen, Datenaktionen, Speicherschäden, vier Breiten und interne Laufzeitmessungen |
| `tests/detail-races.mjs` | Über `tests/browser.mjs` registrierte native Detail-Races: verspäteter Fehler/Erfolg sowie aktueller Fehler mit echtem Neuversuch, jeweils in frischem Kontext |
| `tests/import-races.mjs` | Registrierte native Dateiimport-Races mit synthetischen Sicherungen: überholter Erfolg/Parsefehler, Bestätigung und Neuladen sowie aktuelle Import-/Abbruchkontrollen |
| `public/data/import-report.json` | Maschinenlesbare exakte Statistik, Quellprüfsummen, Artefaktgrössen und Abweichungen |

## Laufzeit und Datenaufteilung

Die Startdatei `catalog.json.gz` enthält alle Präparate-/Packungssummaries und Lookup-Schlüssel. Der einmalig normalisierte Suchindex durchsucht Namen, Wirkstoffe und Codes, niemals die langen Limitierungstexte. Die Preis-Sortierfolgen werden einmal aufgebaut; Filtern erfordert keine neue Sortierung. Suche ändert nicht die Sammlungs-DOM. Unmittelbare Eingabe-/Filter-/Reset-/Seitennavigationshandler haben keine ausstehenden Debounce-Aufträge.

Es werden höchstens 40 Katalogpackungen angezeigt. Die Trefferzahl gilt immer für den vollständigen Katalog; 259 Seiten erschliessen den kompletten ungefilterten Stand. Nur unmittelbar benachbarte Packungen derselben tatsächlichen MedicinalProduct-ID werden gruppiert. Preis-Sortierungen behalten dadurch ihre globale Packungsreihenfolge, auch wenn ein Präparat an mehreren Stellen erscheint. Weitere Packungen desselben Präparats sind in den Details anwählbar.

`texts.json(.gz)` hält exakte deutsche Limitierungstexte, dazu gesonderte FHIR-Bedingungstexte. `details-0` bis `details-f` halten vollständige Originalspalten, strukturierte Wirkstoffe/Klassifikationen, Preisstände und Listungs-/Limitierungsmetadaten. Der deterministische SHA-256-Präparate-ID-Prefix wählt den Detail-Shard. Ein Detailaufruf lädt nur den betreffenden Shard und die gemeinsame Texttabelle. Das optionale vollständige Original-FHIR-gzip wird **nie** beim Start geladen. gzip hat `mtime=0`, sodass neue Imports denselben Inhalt reproduzieren.

Jeder Detailaufruf besitzt einen `detailToken`. Sowohl Erfolg als auch Fehler prüfen diesen vor jeder Änderung des Dialoginhalts; Schliessen oder eine neue Packung entzieht einem älteren Aufruf die Schreibberechtigung. Ein verspäteter Fehler darf daher weder gültige neue Originalangaben entfernen noch einen Neuversuch für die alte Packung anlegen. Aktuelle Fehler bleiben mit „Erneut laden“ sichtbar; das vorhandene Entfernen fehlgeschlagener Loader-Cacheeinträge bleibt unverändert. `showSources` lädt dagegen stets denselben unveränderlichen Importbericht, ohne wechselnde Packungsauswahl.

## Sicherheit und Zustand

Alle Quellen-/Importzeichenketten werden als Textknoten ausgegeben. Originales FHIR-Narrativ-HTML wird im Importer abgeflacht; Skript-/Styleinhalte werden verworfen, Absätze/Listen getrennt. HTML wird niemals als unkontrolliertes `innerHTML` eingefügt. Same-origin CSP sperrt fremde Skripte, Fonts, Frames/Objekte und Laufzeitverbindungen.

Namespace: **`sl.workspace.v1`**, Schema 1. Importiert werden nur exakt erlaubte Felder und Typen, echte ISO-Kalendertage, eindeutige Kennungen und begrenzte ganzzahlige Mengen. Unbekannte Kennungen bleiben als ungeklärte Positionen sichtbar. Ungültige Dateien ersetzen nichts. CSV schützt textuelle Tabellenkalkulations-Formelanfänge durch reversible Apostroph-Kodierung; Quotes, Kommas, Zeilenumbrüche und führende Nullen bleiben erhalten. Kein Auswerten von Formeln.

Der CSV-Schutz berücksichtigt auch Formeln nach führenden Leer-/Whitespacezeichen in Sammlungsnotizen, Bezeichnungen, Positionsnotizen und Favoritenkennungen. Die Importdekodierung stellt alle Originalzeichen unverändert wieder her; `tests/regression.test.mjs` und die native PP-/FAP-Sortierkontrolle in `tests/browser.mjs` sichern beide Randfälle ab.

Jeder Speicherzugriff ist geschützt. Unlesbare/kaputte Original-Rohstrings bleiben erhalten, automatische Writes pausieren. Bei einem `storage`-Ereignis wird nicht blind fremder Zustand geladen: Schreiben pausiert, Export/Neuladen werden angeboten. Direkt vor einem Write wird der Rohwert erneut mit der gelesenen Baseline verglichen. Das ist **keine** registerkartenübergreifende atomare Compare-and-swap-Garantie. Ein expliziter Import erfordert Vorschau, Vorher-Sicherungsdownload (wenn ein Rohstand existiert) und erneute Prüfung direkt vor dem Ersetzen. Fehlgeschlagene Speicherung wird nicht als erfolgreiche Übernahme gemeldet.

Jede Dateiauswahl besitzt einen `importToken`. Nach dem asynchronen Lesen darf nur die jüngste Auswahl die Importvorschau und den bestätigbaren Zustand setzen oder einen Importfehler anzeigen. Ein verspäteter gültiger Import darf keine neuere Sicherung ersetzen; ein verspäteter Parsefehler darf deren Bestätigung nicht stilllegen. Die nativen Import-Races halten nur die Auslieferung eines echten `File.text()`-Resultats zurück und prüfen nach Erledigung beider ursprünglicher Change-Handler die echte Bestätigung, den gespeicherten synthetischen Zustand und dessen Wiederherstellung nach Neuladen.

Preise sind entweder ganze Rappen oder `null`. Jede Zeile ist `BigInt(Rappen) × BigInt(Packungen)`; erst dann werden die Zeilen addiert. Der Formatierer hält die Nachkommastellen exakt, auch über `Number.MAX_SAFE_INTEGER` hinaus. Keine vom Benutzer importierten Preise oder historischen Bezeichnungen überschreiben aktuelle Quellenpreise. Druck-/CSV-/JSON-Snapshots werden jeweils bei der tatsächlichen Aktion aus dem aktuellen Zustand erzeugt.

## Build und Veröffentlichung

`dist/` enthält nur `artifactFiles` aus `scripts/files.mjs`. Nie rekursiv `sources/`, `.local/`, Profile, Projektdateien oder das 188-MB-Archiv kopieren. Der rohe 93-MB-FHIR-Text gehört nicht in den öffentlichen Build; der Originaldownload ist ausdrücklich gzip-komprimiert. Build-/Quell-/Browserartefakte sind getrennt.

Der Pages-Workflow nutzt Node 22/Python 3.12, führt `npm ci`, Checks/Tests/Build aus und lädt ausschliesslich `dist/` hoch. Build hat `contents: read`, `pages: read`; Deploy nur `pages: write`, `id-token: write`. Keine Zugangsdaten im Repository. Der lokale Server liefert nur dieselbe Allowlist unter `/spezialitaetenliste/`.

## Messung und Erweiterung

`tests/browser.mjs` protokolliert auf dem vollständigen Katalog Query- und Query-plus-DOM-Zeiten mit Anzahl der Treffer/gerenderten Zeilen. Das sind interne aktuelle Messungen ohne Paint-/Driverzeit, keine behauptete Vorher-/Nachher-Beschleunigung. Dokument- und Panelüberlauf sowie die Schriftuntergrenzen werden bei 1440, 1024, 390 und 320 Pixeln geprüft, ebenso Dialoganfang und -ende. Fehlversuche bleiben getrennt unter `.local/` erhalten.

Native Akzeptanz ist als `npm run test:browser` registriert; vorher `npm run build` ausführen, da der isolierte Loopback-Server standardmässig `dist/` liefert. `PLAYWRIGHT_MODULE` und `BROWSER_EXECUTABLE` zeigen auf vorhandenes Playwright-Core und einen eigenen headless Firefox/Camoufox-Prozess. Die Detail-Races quittieren die tatsächlich gehaltene HTTP-Anfrage, schliessen über den echten Dialogknopf und warten auf den nativen Close-Handler. Erst nach vollständigem neuem Detail werden alte Antworten freigegeben. Rein beobachtende Plattform-Wrapper um registrierte Klickhandler, `fetch` und `Response.json` erhalten Originalresultate/-Promises; geprüft wird die tatsächliche ursprüngliche Handler-Erledigung, nicht bloss Transport-Freigabe oder eine Wartezeit. Der neue Titel, der vollständige Body, alle zehn Abevmy-Limitierungstexte und die wirkliche Sammlungsaktion müssen erhalten bleiben. Separate frische Kontexte sichern verspäteten Erfolg und aktuellen HTTP 503 mit echtem Refetch ab. Seiten-/Konsolen-/Requestfehler werden auf allen Seiten gesammelt; nur ausdrücklich injizierte, exakt zugeordnete HTTP-503-Konsolenmeldungen werden separat klassifiziert.

Neue Datenstände benötigen bewusst aktualisierte Pins, Schema-/Vollständigkeitskontrollen, Reconciliation, Datenbeschreibung und Browsernachweise. Niemals allein den Anzeigenamen oder Stichtag ändern und alte Preise damit als neu ausgeben.
