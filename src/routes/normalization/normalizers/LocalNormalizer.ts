this.log(`Normalisiere ${rawData.length} Tage`);

import { BaseNormalizer } from '../BaseNormalizer';
import {
    GeoCoordinates,
    WateringData,
    NormalizedWateringData
} from '../../../types';
import {
    celsiusToFahrenheit,
    mmToInches,
    msToMph,
    wpm2ToKwh
} from '../converters';

/**
 * Normalisierer für lokale Wetterdaten (z. B. weewx).
 *
 * Eigenschaften:
 * - Liefert nur Vergangenheit + aktuellen Tag
 * - Timestamps sind nicht zuverlässig auf Mitternacht
 * - Einheiten können metrisch oder imperial sein
 */
export class LocalNormalizer extends BaseNormalizer {
    readonly providerName = 'Local';

    normalizeWateringData(
        rawData: readonly WateringData[],
        coordinates: GeoCoordinates
    ): NormalizedWateringData[] {
        this.log(`Normalisiere ${rawData.length} lokale Tage`);

        const normalized = rawData.map(data => {
            // 1. Timestamp IMMER normalisieren
            const timestamp = this.normalizeTimestamp(
                data.periodStartTime,
                coordinates
            );

            // 2. Einheiten behandeln
            // Annahme: Falls metric === true, müssen wir konvertieren
            const isMetric = data.units === 'metric';

            return {
                timestamp,
                weatherProvider: this.providerName,

                temp_f: isMetric
                    ? celsiusToFahrenheit(data.temp)
                    : data.temp,

                humidity_pct: data.humidity,

                precip_in: isMetric
                    ? mmToInches(data.precip)
                    : data.precip,

                // ETo-relevant (optional)
                min_temp_f: data.minTemp
                    ? isMetric
                        ? celsiusToFahrenheit(data.minTemp)
                        : data.minTemp
                    : undefined,

                max_temp_f: data.maxTemp
                    ? isMetric
                        ? celsiusToFahrenheit(data.maxTemp)
                        : data.maxTemp
                    : undefined,

                min_humidity_pct: data.minHumidity ?? undefined,
                max_humidity_pct: data.maxHumidity ?? undefined,

                wind_mph: data.windSpeed
                    ? isMetric
                        ? msToMph(data.windSpeed)
                        : data.windSpeed
                    : undefined,

                solar_radiation_kwh: data.solarRadiation
                    ? isMetric
                        ? wpm2ToKwh(data.solarRadiation)
                        : data.solarRadiation
                    : undefined,
            };
        });

        // 3. Deduplizieren & Sortieren
        const deduplicated = this.removeDuplicates(normalized);
        const sorted = this.sortReverseChronological(deduplicated);

        this.log(
            `Normalisiert zu ${sorted.length} lokalen Tagen (umgekehrt chronologisch)`
        );

        return sorted;
    }
}
