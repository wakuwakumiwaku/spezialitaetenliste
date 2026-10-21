# BAG-Quellen, Import und Grenzen

## Publikation und Erwerb

- Herausgeber: **Bundesamt für Gesundheit (BAG)**.
- Amtliche Einstiegsseite: <https://sl.bag.admin.ch/resources/current-and-archived-data>.
- Geprüftes Ressourcen-API: <https://epl.bag.admin.ch/api/sl/public/resources/current>. Bei der Beschaffung HTTP 200, aber sämtliche Download-URLs `null`. Die Antwort ist kein verwendbarer Datenexport.
- Archivverzeichnis: <https://epl.bag.admin.ch/api/sl/public/resources/archive>.
- Verwendetes Originalarchiv: <https://epl.bag.admin.ch/static/sl/archive/per-year/2026/2026-10-01/BAG_xls_2026.zip>.
- **Wirksamer Publikations-/Preis-Snapshot: 01.10.2026.** Der Beschaffungs-/Prüftag 21.10.2026 ist kein neuer Datenstand.
- Ein früherer Legacy-Link `XMLPublications.zip` lieferte nach Redirect eine SPA-HTML-Seite statt ZIP-Daten. Dieser Inhalt wurde nicht als Datenquelle importiert.

Die bereits erworbenen Originale/Erwerbsbelege unter `sources/` werden unverändert erhalten und ignoriert. Der Download des Jahresarchivs ist kein Browser-Startschritt. Die App verwendet vollständig vorimportierte amtliche Daten.

## Unveränderte Originale und SHA-256

| Datei | Bytes | SHA-256 |
|---|---:|---|
| `BAG_xls_2026.zip` | 188215969 | `0f2b24ffb556a4c532257775c1c32f86b67a00b79e738699d598474f304bc307` |
| `foph-sl-publication-20261001-de.xlsx` | 3014782 | `b77178c464192722f7ab67c8ee172fc62e7d0c6a4817b8d428649a33d1cfeef1` |
| `foph-sl-publication-20261001-de.ndjson` | 93573213 | `3776cf9157cf9f60259d542bb57c832a1d0fb24e25ad5c5dfb1595f98a6e424d` |

Die beiden Mitglieder liegen im ZIP unter `BAG_xls_2026/` plus obigem Basename. Das publizierte XLSX ist byteidentisch. `foph-sl-publication-20261001-de.ndjson.gz` entpackt zu exakt denselben 93’573’213 Originalbytes mit obigem Hash; gzip ist nur eine verlustfreie Verpackung. Unkomprimiertes Original und Jahresarchiv werden nicht publiziert. Hashes/Grössen aller normalisierten Artefakte stehen im [Importbericht](../public/data/import-report.json).

## Unabhängig abgeglichene vollständige Mengen

| Objekt | Vorkommen | Eindeutige IDs |
|---|---:|---:|
| FHIR Bundle / MedicinalProductDefinition | 6749 | 6749 |
| PackagedProductDefinition | 10352 | 10352 |
| RegulatedAuthorization | 27453 | 24319 |
| Ingredient | 8741 | 8741 |
| ClinicalUseDefinition | 5009 | 1687 |

XLSX `Datenstamm`: 10’353 Zeilenelemente = Header + **10’352 Datenzeilen**. XLSX `Limitierungen`: 6’341 Zeilenelemente = Header + **6’340 Datenzeilen**. Jede Datenstamm-Packungs-ID stimmt mit genau einer FHIR-Packung überein. Keine Packungen ohne Gegenstück, keine verwaisten Limitierungszeilen, keine verworfenen Zeilen wegen fehlenden Preises.

Die FHIR-Datei enthält pro Zeile einen `Bundle` mit Profil `http://fhir.ch/ig/ch-epl/StructureDefinition/ch-idmp-bundle`. Präparat, Packungen, Zulassungen, Inhaltsstoffe und Bedingungen werden über ihre tatsächlichen Beziehungen verarbeitet. Wiederholte RegulatedAuthorization-/ClinicalUseDefinition-IDs werden **nicht global per ID überschrieben**: Zuordnungen behalten Bundle-ID, Präparate-ID, Packungs-ID und Zulassungs-ID. Identischer Text wird lediglich in gemeinsamen Tabellen referenziert. Die 6’340 FHIR-Limitierungslinks liegen unter `RegulatedAuthorization.indication[].extension`, nicht unter der Preisextension.

**Listenumfang:** SL 10’064, GGSL 143, GGML 145. Dies ist die gesamte deutsche Publikation einschliesslich der ausdrücklich bezeichneten breiteren Listen; nicht alles wird als SL umetikettiert. Jede Listenbezeichnung bleibt sichtbar und filterbar.

## Feldzuordnung und unveränderte Zeichenketten

Primäre deutsche Anzeige: XLSX `Handelsname`, `gal.Form/Dosierung`, `Packung`, `Wirkstoffe`, `Zulassungsinhaberin`, GTIN, Swissmedic Code Packung, ATC-Code, Listung, Charakteristikum sowie Aufnahme-/Befristungsdaten. Zusätzlich werden **alle 34 ursprünglichen Datenstamm-Spalten** pro Packung und alle 19 Limitierungs-Spalten pro zugeordneter Zeile erhalten, ohne deren Originalzeichenketten umzuschreiben. Ergänzende FHIR-Wirkstoffstärken/Klassifikationen bleiben strukturiert einsehbar. Nichtganzzahlige FHIR-Supplementwerte werden nach exaktem Decimal-Parsing als Dezimalzeichenketten serialisiert, nicht als gerundete Gleitkommawerte.

GTIN, Swissmedic, Vorgänger-GTIN und Quell-IDs werden als Zeichenketten behandelt. Keine Umwandlung zu Zahlen, keine ergänzten Nullen, keine erfundenen Codes. Jede vorhandene PackagedProduct-ID ist eindeutig; der Importer hat bei fehlender ID einen deterministischen quellzeilenbezogenen SHA-256-Fallback statt eines erratenen GTINs. Im konkreten Stand ist kein solcher Fallback erforderlich. **Pharmacodes sind nicht enthalten** und bleiben bei allen 10’352 Packungen `null`.

`Charakteristikum` wird nur als expliziter Quellcode angezeigt/gefiltert; strukturierte FHIR-Produkttypen und deren Originalbezeichnungen bleiben separat in den Details. Aus Wirkstoff, ATC oder ähnlichem Namen werden keine Kategorien, Indikationen, Generika-Zuordnungen oder Austauschbeziehungen erfunden. Ein leeres Charakteristikum wird nicht zu einem Originalpräparat gemacht.

## Preise und Stichtag

- **Publikumspreis inkl. MwSt** und **Fabrikabgabepreis exkl. MwSt** sind getrennt.
- Vergleichswährung: **CHF**. Alle 20’367 FHIR-Preisdatensätze werden samt Originaltyp, Änderungsgrund und Änderungsdatum erhalten.
- Ausgewählt wird pro Preistyp nur der eindeutige letzte CHF-Preis mit `changeDate <= 2026-10-01`. Nicht das heutige Datum und nicht blind der letzte Array-Eintrag. Zukünftige Werte würden erhalten, aber nicht als Stichtagspreis verwendet. Im konkreten Export liegen keine zukünftigen Preisrecords vor.
- Der Stichtagswert wird gegen das XLSX geprüft. Widerspruch oder mehrdeutiger letzter Preis führt zu `null` und einem Berichtseintrag, nicht zu einer willkürlichen Auswahl. **Im konkreten Stand: 0 Preiskonflikte.**
- Fehlende Publikumspreise: **152**, fehlende Fabrikabgabepreise: **185**. Die Packungen bleiben im Katalog. Fehlend ist nie automatisch null CHF.
- Mengen sind ganze **Packungen**. Dezimalpreise werden im Import mit Decimal exakt auf Rappen gerundet (`ROUND_HALF_UP`); die Zeile ist Rappen × Packungen, anschliessend Zeilensumme mit BigInt. Unbekannte Preise/Packungen werden nicht als bezifferte Nullpreis-Zeilen behandelt; beide Teilsummen nennen ihre jeweils fehlenden Positionen.
- Keine Umrechnung pro mg/Einheit, keine angenommene Packungs-/Dosiskompatibilität, keine Versicherungs-/Selbstbehaltsformel. Ein im Original vorhandener Selbstbehaltswert bleibt nur eine Originalspalte, nicht ein persönlicher Kostenentscheid.

## Limitierungen und Erhalt der Kontexte

**4’249 Packungen** haben zusammen **6’340 XLSX-Limitierungszuordnungen**; diese referenzieren **2’118** unterschiedliche vollständige Kombinationen aus exaktem deutschem Text, Limitierungscode, Indikationscode, Punkten und Fristen. Tabellenreferenzen sparen Übertragungsvolumen, aber keine Zuordnung wird entfernt oder auf ein anderes Präparat erweitert. Die Originalzeichenketten einschliesslich Absätzen, Listenpunkten und Leerraum werden unverändert über `textContent` dargestellt.

Die ergänzenden FHIR-Ressourcen ergeben **1’687** unterschiedliche Bedingungsdatensätze und ebenfalls **6’340** Packungs-Limitierungslinks. Status, Statusdatum, Beginn/Ende, Vergütungsende, erste Limitierung und Indikationscode bleiben separat und attributiert erhalten, auch wenn ein Datum historisch oder zukünftig ist. Keine klinischen Bedingungen werden automatisch ausgewertet oder weggelassen.

Ein whitespace-normalisierter Textabgleich findet bei **24 Packungen** Unterschiede zwischen XLSX und FHIR. Alle 24 verschwinden exakt nach zusätzlichem Entfernen des Aufzählungszeichens `•`; der FHIR-Text enthält dort nicht die XLSX-Listenpunkte. Beide Fassungen und alle Zuordnungen bleiben vorhanden. Das XLSX ist für den vollständigen deutschen Anzeigetext primär, nicht die flachere FHIR-Narrativfassung. Die betroffenen Packungs-IDs stehen im Importbericht; dies wird nicht als fehlender Limitierungstext ausgegeben.

## Explizite Lücken

| Feld | Packungen ohne Wert |
|---|---:|
| GTIN | 87 |
| Swissmedic Code Packung | 150 |
| Pharmacode | 10352 |
| Wirkstoffangabe | 58 |
| ATC-Code | 58 |
| Publikumspreis | 152 |
| Fabrikabgabepreis | 185 |

Einträge mit solchen Lücken bleiben erreichbar und werden nicht mit ähnlichen Packungen verschmolzen. Die Software garantiert weder Aktualität über den genannten Snapshot hinaus noch individuelle Leistungspflicht oder therapeutische Austauschbarkeit. Die amtlichen Originaltexte sind Referenzmaterial, keine automatisch geprüfte Behandlungsanweisung.
