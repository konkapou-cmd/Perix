# Mobility: permitted sources and geometry triage (2 November 2026)

## Scope and outcome

This is a **read-only, dated diagnostic**, not legal advice, a GPS validation, or a release. It covers the Magdeburg bus/tram network and map captured on 2 November 2026. A pattern is a particular ordered direction/stop sequence, not a physical vehicle. The active network was `net_9d97f995b79a` for service date `2026-11-02`.

The audit matched **186/186 expected patterns** across **34 route/mode combinations** to same-version, same-service-date map rows. It found no technical identity/fingerprint/stop-order input errors under this audit's checks. This does **not** establish physical route accuracy.

| Diagnostic | Patterns |
|---|---:|
| Any review flag | 117 |
| Exact immediate out-and-back run, at least 3 edges and 100 m | 98 |
| Difference above 100 m between the existing two stop projection methods | 79 |
| Both flags | 60 |

The flags overlap. They are **review signals**, not proven wrong lines; genuine terminus turns, loop routes, close parallel tracks and other legitimate patterns can be flagged. A return trip is not a GPS observation. The report covers 102 bus and 84 tram patterns; 58 bus and 59 tram patterns have at least one flag. The diagnostic thresholds are triage parameters, not approved routing rules.

Concrete priorities include N8 `N8:2bfdf50506`, whose two local projections differ by about 1,280 m at Alter Markt, and several other flagged patterns with larger differences. An independent check is needed before adopting either projection or treating an exact reversal as erroneous. In the previous N8 investigation, two methods merely moved the questionable repeated section to different legs; neither repaired or independently verified the path.

## Source and rights inventory

| Source | Published status / permitted-use starting point | Constraints before use |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL open data | Credit OpenStreetMap contributors, link the licence, and review ODbL obligations for the particular derived database/distribution. The source is not proof of actual travel and can be stale or under construction. OSM tile/API policies are separate. |
| [gtfs.de local static GTFS](https://gtfs.de/en/feeds/de_nv/) | Provider links Creative Commons Attribution 4.0 (CC BY 4.0). | Retain provider/attribution, link, licence, changes and source version; audit accuracy. The downloaded free archive had **no `shapes.txt`**, so stop schedules cannot certify track geometry. |
| [gtfs.de realtime](https://gtfs.de/en/realtime/) | Provider labels the realtime stream beta and **CC BY-SA 4.0**. | Check attribution and applicable ShareAlike obligations separately from static GTFS before redistribution/derivation. No warranty of coverage or correctness; header freshness is not a per-trip timestamp. |
| [NASA/MVB GTFS on Mobilithek](https://mobilithek.info/offers/620651164804734976) | NASA is listed as provider, MVB as owner, and CC BY 4.0 as the licence. A separately listed example is publicly downloadable. | The regular content requires an organization subscription and explicit provider approval. Open licensing does not remove that access condition. The example's limited date, coverage and stop-only coordinates prevent its use as a detailed current route reference; see below. The contents and precision of the regular feed remain unknown. |
| [NASA/marego GTFS](https://mobilithek.info/offers/904459247043899392) and [marego without railway data](https://mobilithek.info/offers/877982569157517312) | GovData lists both as NASA-provided GTFS with CC BY 4.0, including MVB among the named companies. | Offer pages did not load their full content during this investigation. Access conditions, actual MVB coverage, date and geometric precision have not been verified. A catalogue listing alone is not permission or route evidence. |
| [DELFI nationwide NeTEx and GTFS](https://www.opendata-oepnv.de/ht/de/organisation/delfi/startseite) | DELFI describes nationwide timetable data and weekly publication. | The page says registration is required to download. Dataset-specific terms, Magdeburg coverage, detailed geometry and date validity require verification after authorized access. Do not equate NeTEx with a physically precise route. |
| INSA/HAFAS | Used only as an independent browser comparison during investigation. | The INSA site rights notice and the community client licence do not establish permission to ingest/copy/publish INSA geometry. Obtain explicit access/reuse conditions and provenance before implementation. |
| MVB published timetable / PDFs | Useful for checking stated stop order and timetables. | A PDF is not a georeferenced track survey or a licence to copy into production. Date, exceptions and usage rights must be checked. |

Licences can change and combined/derived-database obligations depend on the actual use. Have the responsible legal/licensing reviewer verify the intended distribution; a visible map's base-map copyright alone does not establish full attribution for all derived Mobility sources. No new provider, credentials, billing plan, or configuration was enabled.

## NASA/MVB publicly listed GTFS example

The Mobilithek offer separates **Beispiele** from **Inhaltsdaten**. On 2 November 2026 its visible link to [`gtfs_mvb_std_kn.zip`](https://mobilithek.info/mdp-api/files/aux/620651164804734976/gtfs_mvb_std_kn.zip) returned HTTP 200 without authentication or subscription. The same offer states that regular content is available only after explicit approval of an organizational subscription. We did not subscribe or access the gated content.

The public example is 47,223 bytes, SHA-256 `5fe4feed37744adf1db8d1630168cce4591b23ecbaf22418436784c9a6c9b05b`; its listing is dated 7 May 2026. `feed_info.txt` and `calendar.txt` both restrict its service to **7 May 2026**. It contains one route, tram **1**, 393 trips, 114 stops and `shapes.txt` with 12 shape IDs and 356 points. All 393 trips reference one of the 12 shapes. The example is not evidence of full-feed coverage, current service, or N8 geometry.

For a basic precision check, compare each shape coordinate pair with every coordinate pair in `stops.txt`: **356/356 match a stop coordinate exactly**. Of 344 adjacent shape-point pairs, 166 are identical consecutive coordinates. The remaining segments join stop coordinates without intermediate shape vertices. Thus the existence of `shapes.txt` here does not establish a detailed track geometry between stops. Do not copy these shapes over the existing street/rail path or claim physical verification. The gated regular dataset may differ; its shape availability, detail, coverage and dated validity remain unverified. Local example: `C:\Users\PC\AppData\Local\Temp\opencode\mobilithek-mvb-example-20260507.zip`.

## Read-only shape-source screening

`tools/inspect_gtfs_shapes.py` inventories an already obtained GTFS ZIP for an explicit service date. It selects trips using the weekly calendar and additions/removals, counts missing shape IDs and missing shapes, and flags shapes whose every vertex exactly matches a feed stop coordinate. It checks shape sequences and coordinates and reports its input SHA-256. It does not retrieve a feed, approve a licence, check `feed_info` validity, match source trips to PERIX, validate geometry against GPS, or activate data. A shape with intermediate vertices is **not** automatically a good shape; loop/direction and physical alignment remain separate checks.

```text
python -B tools/inspect_gtfs_shapes.py --gtfs <authorized-feed.zip> --service-date 2026-11-02 --output <new-report.json>
```

The output file is created exclusively. Synthetic tests cover service-date exceptions, missing shapes, duplicate or invalid input and overwrite protection. Running the tool on the public MVB example for 7 May reproduces 393 active trips and 12 active shapes with all vertices at feed stop coordinates. This is diagnostic only; it cannot establish that a replacement is physically correct.

The [Mobility Database catalogue](https://files.mobilitydatabase.org/feeds_v2.csv) was searched for the literal terms Magdeburg, Sachsen-Anhalt, Sachsen Anhalt, marego and INSA: no rows contained those terms in the downloaded catalogue. This does not exclude geographically broader feeds or sources absent from the catalogue. The [gtfs.de realtime documentation](https://gtfs.de/en/realtime/) describes TripUpdates and ServiceAlerts, **not vehicle positions**; its Sachsen-Anhalt entry does not provide independent raw GPS from that stream.

## Google Maps feasibility for stop-to-stop review

The requested purpose is verification of the **line path between consecutive stops**, not derivation of live vehicle positions. The web map uses Google Maps for display, but `frontend/components/BusinessMap.web.tsx` draws the `line.points` supplied by PERIX; the current `/app` code obtains dated lines via `getV2Map`. A Google basemap does not automatically provide the transit shapes used by the Mobility solver.

[Routes API transit documentation](https://developers.google.com/maps/documentation/routes/transit-route) describes route and step polylines, transit line metadata, stops and time. However, the API calculates a passenger itinerary, can include walking or transfers, does not support intermediate transit waypoints, and accepts preferences rather than a guaranteed requested line. Even a direct-looking result needs date, direction, line, stop and trip identity checks; a proposed route is not independently surveyed track or proof of actual operating conditions. Availability and shape precision for any Magdeburg line have not been tested.

The existing `mobility/motion/google_traffic.py` is a separate opt-in adapter for traffic estimates on validated OSM road edges. Its local code is gated by flags, a dedicated key, region and request budget and does not export Google geometry; it is **not** a transit-line geometry verifier. Local defaults do not prove the live configuration.

Before a pilot, the account owner and appropriate licensing reviewer must determine which Google agreement applies, whether Routes API is enabled and what usage would cost. Google's [Routes billing documentation](https://developers.google.com/maps/documentation/routes/usage-and-billing) states Compute Routes requests are billable by SKU and require billing enabled; map display access alone does not establish Routes API access. The [EEA terms](https://cloud.google.com/terms/maps-platform/eea) include restrictions on creating content from Google Maps Content, scraping and caching; the [EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) section 20 restricts use of Routes API descriptions or steps with any map and sets conditions for caching coordinate values. Applicability depends on the actual agreement, billing location and integration. Do not infer that retrieving a step polyline grants permission to use it for an OSM/PERIX correction or make a blanket claim that all comparisons are allowed or prohibited.

If the agreement permits the precise proposed use, a deliberately bounded, separately approved pilot could request one dated N8 stop pair, check returned transit identity and coverage, and review the result under the applicable attribution, retention and display terms. If an itinerary uses another line, walking, a transfer, wrong direction, date or stop, mark it **inconclusive**. Ask Google specifically whether comparison and subsequent changes to independently sourced PERIX/OSM geometry are permitted. No Google API request, key/configuration change, content extraction, geometry adoption, billing change or deployment was made for this investigation.

### Specific notice and Google pilot assessment

- The [MVB notice of 30 October 2026](https://www.mvbnet.de/ab-montag-strassenbahnen-fahren-wieder-ueber-alter-markt-verbessertes-liniennetz-zum-schulstart/) reports reopening the central tram corridor on 2 November and lists N8 Barleber See–City Carré as unchanged. It does not identify individual track ways, platform side or direction at City Carré–Alter Markt. The separate [MVB dated N8 timetable](https://www.mvbnet.de/files/2026/10/mvb-nacht-aushang-a4-n8-2.11.2026-tram-1.pdf) gives 23:15 City Carré and 23:17 Alter Markt for the previously investigated journey; it does not prove a specific track connection. Existing N8 geometry evidence is documented separately in the local N8 investigation.
- As an example of a more useful notice, the [MVB bridge-closure notice](https://www.mvbnet.de/brueckensperrung-in-der-halberstaedter-strasse-linien-13-n3-und-n5-fahren-veraendert/) describes the 13/N3/N5 diversion through Wiener Straße and named temporary stops, with Jordanstraße omitted. It also says some changes from 17 October are not in the published timetable and the end date was then unknown. This is a historical example, not proof the closure is active now; exact directed graph edges and the current operating window remain to be verified.
- [MVB's website terms](https://www.mvbnet.de/impressum/) state that reproduction or use of MVB-created texts and other listed content in electronic or print publications requires express consent. This is distinct from the licence for separately published GTFS feeds; do not assume the website text is CC BY or that reading factual information establishes an automated copying/redistribution right. Ask MVB for permissions or use an appropriately licensed service-alert feed.
- Google [`TRANSIT` route documentation](https://developers.google.com/maps/documentation/routes/transit-route) allows a service time, returns optional transit details and polylines, but does not force an exact line or support intermediate transit waypoints. Only seven days in the past and 100 days in the future are documented; an older historical trial may not be possible. It may return walking, transfers or other lines. The Google coverage, actual returned identity, geometry and independent accuracy of this N8 trip **remain untested**.
- [Google global pricing](https://developers.google.com/maps/billing-and-pricing/pricing#routes-pricing) lists Compute Routes Essentials with a monthly 10,000-event free usage cap and $5 per 1,000 events in the first paid tier; [SKU rules](https://developers.google.com/maps/billing-and-pricing/sku-details/routes#compute-routes-ess-sku) say higher-feature requests can incur a higher SKU. These published figures are not a quote or a guarantee of zero cost: billing-account usage, contract, location, taxes and request features matter. The current local process has no Routes key in its environment; this does not establish whether the deployed project has one.
- **No Google Routes request or actual Google/MVB geometry comparison was performed.** No terms or account permissions specific to the customer have been independently confirmed. Before any pilot, determine the applicable agreement, confirm the proposed comparison and use with Google/support or the licensing reviewer, make an explicit spend-bounded approval, and use an authorized credential without exposing it in chat or logs. Until then neither a successful Google response nor permission to use one is established.

## Priority groups for further independent checks

For the 60 patterns with **both** diagnostic flags, group by the stop occurrence having the largest disagreement (not by presumed track or cause). This is a review queue, not proof of a shared error or physical impact:

| Mode / maximum-disagreement stop | Patterns | Routes | Maximum disagreement |
|---|---:|---|---:|
| Tram / Alter Markt (`649921`) | 25 | 1, 2, 3, 4, 5, 6, 8, 9, 10, N8 | 1,280.2 m |
| Tram / S-Bhf. Eichenweiler (`310846`) | 11 | 1, 3, 5, 6, 8, 9, 10, N8 | 2,058.4 m |
| Tram / Schleswiger Straße (`533256`) | 10 | 1, 2, 4, 5, 6, 8, 9, 10, N2 | 2,878.2 m |
| Tram / Goldschmiedebrücke (`642804`) | 5 | 4, 5, 6 | 1,068.9 m |
| Bus / Westringbrücke (`581874`) | 3 | N5, N9 | 2,428.3 m |
| Other groups | 6 | N1, N7, N8 bus; 9 tram | Varies |

Stop IDs are those in the captured network, not stable cross-provider identifiers. Each pattern is counted once at its maximum-disagreement stop; the numbers do not count vehicles, affected trips, or independently confirmed errors. For Alter Markt, a separate exact-coordinate check found 20 map patterns containing the same 47-point N8 reversal sequence; that is a different grouping and must not be equated with the 25 patterns above. Review dated stop order, direction, infrastructure and legitimate loops individually, then compare with a sufficiently detailed, appropriately licensed dated reference or independent GPS before proposing a change. The full list remains in the local CSV/JSON artifacts below.

## Updated OSM evidence: N8 local replay (2 November)

The earlier N8 investigation used OSM data with base timestamp **08:45:36 UTC** and found way `1498361845` tagged `railway=construction`. The [OSM way history](https://www.openstreetmap.org/api/0.6/way/1498361845/history) now shows version 2 at **09:02:43 UTC**, changing that way to `railway=tram`. The [changeset](https://www.openstreetmap.org/api/0.6/changeset/191355724) describes reopening overlooked segments near Alter Markt. This is a community update, not operator confirmation of this trip or exact platform/direction.

A fresh bounded Overpass capture with base timestamp **10:31:36 UTC** includes the updated way. In a read-only replay using the existing PERIX tram graph and the first four stops of dated pattern `N8:2bfdf50506`, City Carré → Alter Markt is **306.63 m, 49 edges**, and includes that way. The captured earlier PERIX generation's first segment was approximately **1,560 m, 99 edges**. The first three candidate legs form a continuous edge chain; the existing geometry validator accepts it, there are no exact immediate reversal runs of at least 100 m in these three legs, and the two existing projection methods differ by at most **11.1 m** over the four stops. Both the existing bidirectional tram router and an experimental generic-oneway interpretation produce this same short first leg; generic OSM tags do not establish the operational direction.

This is a **candidate, not a confirmed correction**: the OSM data is newer than the dated PERIX capture, the graph is geographically bounded, stop snapping may select the wrong platform/track, and neither an operator trip shape nor raw independent GPS verifies the exact N8 route. The remaining N8 stops, all affected patterns, timetable and motion/preview invariants have not been retested on a complete new generation. No data has been activated. The source is © OpenStreetMap contributors, ODbL; capture `C:\Users\PC\AppData\Local\Temp\opencode\n8-osm-updated-20261102.json` SHA-256 `4f1b7c745194a4c6f2cd944946555dae01107bf3cee7d04278d6d268200e6176`; replay `C:\Users\PC\AppData\Local\Temp\opencode\n8-osm-updated-replay-20261102.json`.

### Open realtime alert availability at one instant

One unauthenticated [gtfs.de GTFS-RT](https://gtfs.de/en/realtime/) capture at **10:31:45 UTC** had feed timestamp 10:31:25 UTC and 454 national ServiceAlerts. Against the 2 November PERIX network `net_9d97f995b79a`, the existing strict local GTFS-identity check accepted **0** alerts: 452 had no matching strong local identifiers and 2 were mixed/nationwide. This is one snapshot and one network identity: it does not prove that there were no MVB disruptions, that the provider never covers Magdeburg, or that a national alert cannot include a local effect. ServiceAlerts remain informational, not verified graph closures or detour geometry. The feed is published CC BY-SA 4.0; applicable attribution and ShareAlike obligations must be reviewed.

## Reproducible offline tool

`tools/audit_transit_geometry.py` reads two existing JSON captures. It does not call APIs, write a database, edit maps or activate a network. It verifies dated identity, compares stop occurrences and fingerprints, flags exact reversal runs, and compares the *existing* nearest-vertex solver projection to the existing validator's earliest-plausible projection. The comparison is diagnostic: neither is automatically chosen as truth.

```text
python -B tools/audit_transit_geometry.py --network <captured-network.json> --map <captured-map.json> --output <new-report.json>
```

The report output is created exclusively and never overwrites an existing file. Inputs are hashed in the report. Malformed/undated or nonmatching inputs fail closed, and foreign dated map rows are excluded. Unit tests use synthetic examples including reversals that may be legitimate, conflicting identities, wrong dates, bad fingerprints, and existing-output protection.

Captured audit artifacts for this investigation are local:

```text
C:\Users\PC\AppData\Local\Temp\opencode\perix-all-lines-audit-20261102-report.json
C:\Users\PC\AppData\Local\Temp\opencode\perix-all-lines-audit-20261102-patterns.csv
```

The CSV lists diagnostic flags per pattern; `physical_accuracy_verified` is always false because no independent physical validation is supplied.

## Safe next steps

1. Triage repeated shapes and conflicting projections, starting with shared corridors and the N8; preserve terminal reversals and true repeated stop visits. Compare against source-specific dated geometry and independent observations where permitted.
2. Obtain specific current operator confirmation for the N8 construction-tagged connection or an independently licensed, dated track reference; never automatically treat `railway=construction` as open or copy unlicensed INSA geometry.
3. Design any local candidate against the actual directed infrastructure with unchanged stop, geometry, clock, source, ETA and preview safeguards. Test both true reversals and false loops; reject ambiguous cases rather than fabricate paths.
4. Repeat same-date matching, licence/provenance checks, end-to-end rendering and load/capacity tests in controlled staging before requesting approval for any deployment. One day's clean identity check cannot prove accuracy across future service dates, construction changes, or live vehicle movements.

No production data, provider configuration, commit, push or deployment was changed as part of this audit.
