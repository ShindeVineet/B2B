# Phase 5 map accuracy audit — 2026-09-27

## Diagnosis reported before the fix

No latitude/longitude reversal was found in the active pipeline. The confirmed systemic precision limitation is PIN-first geocoding: a successful PIN lookup returns immediately without using the street address. This is a representative postal point, not an office-level location. The dataset loader keeps the first post office for a PIN; it does not calculate a centroid.

| Boundary | Observed behavior before the fix |
| --- | --- |
| IndiaPIN CSV | Header columns `Latitude` then `Longitude`; positional parsing used indexes 9 and 10 in the correct order. Naive comma splitting could mishandle quoted commas. |
| PIN provider | Reads named `lat` and `lng` from `pincode_geocache`. |
| Nominatim adapter | Maps response `lat` to `lat`, `lon` to `lng`; caches named fields. |
| Lead create/import/update | Writes provider `lat` and `lng` without swapping. Imported coordinates can bypass geocoding. |
| Leaflet | Uses latitude then longitude; no reversal found. |
| Google Maps links | Uses `lat,lng`. |

Read-only database audit: **119 leads**, **0 missing coordinate pairs**, **0 outside the PRD's India box**, **25 exact matches to their current PIN cache point**. The ten sampled matching records included PINs 560102 and 562125; multiple leads shared one PIN point. Cache equality supports PIN-level precision as a systemic issue, but does not prove provenance for an individual historical row.

User-supplied examples:

| Lead | PIN | Stored latitude | Stored longitude | Address evidence |
| --- | --- | --- | --- | --- |
| MSP Interiors | 560037 | 12.97631962065925 | 77.6895677083745 | No saved street address |
| TimberCraft - CARPENTRY&INTERORS | 560037 | 12.97594235691899 | 77.69093746280637 | Partial street address |
| Deejos Interiors Pvt Ltd | 560037 | 12.97288370654881 | 77.6915033242145 | `43, HAL Old Airport Rd` |

The initial audit did not establish the original provider for these rows. Follow-up inspection on 2026-09-28 found explicit place coordinates in their stored Google Maps links. Those links had been ignored by the PIN-first pipeline. The subsequent A/B/C rewrite accepted Deejos at `{lat:12.9594219,lng:77.6558297}`, MSP at `{lat:12.9689826,lng:77.6886127}`, and TimberCraft at `{lat:12.971382,lng:77.6925626}` after area validation. These are source-backed Google-link locations, not field-verified manual pins. See `MAPPING-CONSULTATION-COLD-REVIEW.md` for the superseding pipeline and full reprocessing result.

## Implemented corrections

- Named `{lat, lng}` coordinates at map/route boundaries and geometry helpers.
- Header-based CSV parsing with Papa Parse, including quoted fields.
- India bounding validation (inclusive latitude 6–38, longitude 68–98), provenance and verification metadata on lead geocoding writes.
- Invalid locations are excluded from both lead-map and rep-route rendering and appear in Needs Geocode Fix after migration.
- Any lead can be opened from the funnel for a scoped admin/manager numeric Correct Pin action. Manual correction records provenance, verification, and activity history.
- Consultation GPS is requested on form open, with graceful permission failure. A submitted point more than 3 km from a valid saved lead point flags the lead for review.
- The original Phase 5 migration retained unknown historical sources. The subsequent A/B/C pipeline replaces PIN plotting with bounded business/address search and explicit Google-link coordinates; uncertain results now enter Mapping Issues.
