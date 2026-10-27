# GeoSphere Austria

The GeoSphere provider uses the [GeoSphere Austria Data Hub](https://data.hub.geosphere.at) API (`dataset.api.hub.geosphere.at`). It is intended for locations in Austria and requires no API key.

Select it in `.env`, either as the main provider or as the forecast override:

```text
WEATHER_PROVIDER=GeoSphere
# or, for example together with a local PWS:
WEATHER_PROVIDER=local
FORECAST_WEATHER_PROVIDER=GeoSphere
```

Two Data Hub resources are combined, because no single resource covers both past and future:

| Use | Resource | Parameters |
| --- | --- | --- |
| Watering data (Zimmerman/ETo history) | `inca-v1-1h-1km` (historical analysis) | `T2M`, `RH2M`, `RR`, `UU`, `VV`, `GL` |
| Current weather and forecast | `nwp-v2-1h-1km` (forecast model) | `2t`, `2r`, `tp`, `10u`, `10v`, `ssrd`, `sy` |

Values are converted to the service's internal units (°F, inches, mph). Wind is standardized to a 2 m measurement height for ETo calculations.

The forecast resource has a horizon of roughly 61 hours, so the rain-forecast restriction and forecast display cover about two and a half days.

Data is published under CC BY 4.0 and requires the attribution "GeoSphere Austria". The provider returns this in the `attribution` field of its weather data.
