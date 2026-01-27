this.log(`Normalisiere ${rawData.length} Tage`);

import { BaseNormalizer } from '../BaseNormalizer';
import { GeoCoordinates, WateringData, NormalizedWateringData } from '../../../types';

/**
 * Normalisierer für OpenMeteo Wetterdienst.
 *
 * OpenMeteo Eigenschaften:
 * - Liefert Tagesdaten bereits in lokaler Zeit
 * - Reihenfolge ist meist umgekehrt chronologisch
 * - Einheiten können API-seitig auf Imperial gesetzt werden
 */
export class OpenMeteoNormalizer extends BaseNormalizer {
    readonly providerName = 'OpenMeteo';

    normalizeWateringData(
        rawData: readonly WateringData[],
        coordinates: GeoCoordinates
    ): NormalizedWateringData[] {
        this.log(`Normalisiere ${rawData.length} Tage`);

        const normalized = rawData.map(data => ({
            // Wir normalisieren explizit, um Provider-unabhängige Konsistenz
            // sicherzustellen (auch wenn OpenMeteo bereits lokale Tage liefert).
            timestamp: this.normalizeTimestamp(
                data.periodStartTime,
                coordinates
            ),

            weatherProvider: this.providerName,

            // Bereits imperial konfiguriert über API
            temp_f: data.temp,
            humidity_pct: data.humidity,
            precip_in: data.precip,

            // Optional (ETo)
            min_temp_f: data.minTemp ?? undefined,
            max_temp_f: data.maxTemp ?? undefined,
            min_humidity_pct: data.minHumidity ?? undefined,
            max_humidity_pct: data.maxHumidity ?? undefined,
            wind_mph: data.windSpeed ?? undefined,
            solar_radiation_kwh: data.solarRadiation ?? undefined,
        }));

        const deduplicated = this.removeDuplicates(normalized);
        const sorted = this.sortReverseChronological(deduplicated);

        this.log(
            `Normalisiert zu ${sorted.length} Tagen (umgekehrt chronologisch)`
        );

        return sorted;
    }
}
