# Test fixtures

Trimmed real responses from the [adsb.lol API](https://api.adsb.lol/docs), used by the tests.
Unofficial, not affiliated with adsb.lol.

## Files

| File                | Endpoint                                         | Notes                                                                                                                                                 |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2-point.json`     | `https://api.adsb.lol/v2/point/51.47/-0.45/10`   | 3 of 39 aircraft: airborne (padded `flight`, `dst`, `dir`), `alt_baro: "ground"`, no `flight` field.                                                  |
| `v2-closest.json`   | `https://api.adsb.lol/v2/closest/51.47/-0.45/10` | Unchanged, 1 aircraft.                                                                                                                                |
| `v2-empty.json`     | `https://api.adsb.lol/v2/sqk/abcd`               | Invalid squawk; returns 200 with an empty list. Unchanged, `ac: []`, `total: 0`.                                                                      |
| `v2-mil.json`       | `https://api.adsb.lol/v2/mil`                    | 2 of 143 aircraft.                                                                                                                                    |
| `v2-pia.json`       | `https://api.adsb.lol/v2/pia`                    | Unchanged, 1 aircraft.                                                                                                                                |
| `v2-ladd.json`      | `https://api.adsb.lol/v2/ladd`                   | 2 of 98 aircraft.                                                                                                                                     |
| `airport-egll.json` | `https://api.adsb.lol/api/0/airport/EGLL`        | Unchanged.                                                                                                                                            |
| `me.json`           | `/0/me` (spec path)                              | Reconstruction of the `/0/me` response structure observed 2026-10-28 with anonymized values; on 2026-10-29 the live response had empty client arrays. |

## Source and retrieval

- Source: `https://api.adsb.lol`, API version 0.0.2 (OpenAPI spec).
- Retrieved: 2026-10-29, except `me.json`.
- Trimming: aircraft lists were shortened to the entries listed above and `total` was set to the new length. All other values and field order are unchanged.
- `me.json` is a reconstruction of the response structure observed on 2026-10-28. The values were replaced with anonymized placeholders (`ip` `192.0.2.1`, `user` `example`, and so on), so it is not a verbatim capture.

## License

The data is licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Attribution: © adsb.lol contributors.
