import { GeoCoordinates, WateringData, NormalizedWateringData, ValidationResult } from '../../types';
import geoTZ from "geo-tz";
import TZDate from '@date-fns/tz';
import { startOfDay, getUnixTime } from 'date-fns';

/**
 * Abstrakte Basis-Klasse für Wetterdaten-Normalisierer.
 * Jeder Provider implementiert einen konkreten Normalizer der diese Klasse erweitert.
 */
export abstract class BaseNormalizer {
    /**
     * Provider Name (z.B. "OpenMeteo", "WUnderground", "Local")
     */
    abstract readonly providerName: string;

    /**
     * Normalisiere rohe WateringData zu NORM-konformem Format.
     *
     * @param rawData - Rohdaten vom Provider
     * @param coordinates - Standort-Koordinaten für Zeitzone-Berechnung
     * @returns Normalisiertes Daten-Array
     */
    abstract normalizeWateringData(
        rawData: readonly WateringData[],
        coordinates: GeoCoordinates
    ): NormalizedWateringData[];

    /**
     * Normalisiere einen einzelnen Timestamp auf lokale Mitternacht.
     *
     * @param timestamp - Unix epoch Sekunden (beliebige Tageszeit)
     * @param coordinates - Standort-Koordinaten
     * @returns Unix epoch Sekunden der lokalen Mitternacht
     */
    protected normalizeTimestamp(
        timestamp: number,
        coordinates: GeoCoordinates
    ): number {
        // 1. Hole Zeitzone aus Koordinaten
        const timezone = geoTZ.find(coordinates[0], coordinates[1])[0];

        // 2. Erstelle TZDate im lokalen Kontext
        const date = new Date(timestamp * 1000);
        const tzDate = new TZDate(date, timezone);

        // 3. Tagesbeginn in lokaler Zeitzone
        const localMidnight = startOfDay(tzDate);

        // 4. Zurück zu Unix epoch
        return getUnixTime(localMidnight);
    }

    /**
     * Sortiere Daten in umgekehrter Chronologie (neueste zuerst).
     */
    protected sortReverseChronological(
        data: NormalizedWateringData[]
    ): NormalizedWateringData[] {
        return [...data].sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Sortiere Daten chronologisch (älteste zuerst).
     */
    protected sortChronological(
        data: NormalizedWateringData[]
    ): NormalizedWateringData[] {
        return [...data].sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Entferne doppelte Timestamps.
     */
    protected removeDuplicates(
        data: NormalizedWateringData[]
    ): NormalizedWateringData[] {
        const seen = new Set<number>();
        return data.filter(item => {
            if (seen.has(item.timestamp)) {
                console.warn(
                    `[${this.providerName}] Doppelter Timestamp: ${new Date(item.timestamp * 1000)}`
                );
                return false;
            }
            seen.add(item.timestamp);
            return true;
        });
    }

    /**
     * Logge Normalisierungs-Info.
     */
    protected log(message: string): void {
        console.log(`[${this.providerName} Normalizer] ${message}`);
    }

    /**
     * Logge Warnung.
     */
    protected warn(message: string): void {
        console.warn(`[${this.providerName} Normalizer] ${message}`);
    }
}