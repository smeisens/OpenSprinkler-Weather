import { GeoCoordinates } from '../../types';

/**
 * Zeitliche Einordnung eines normalisierten Datensatzes.
 */
export type NormalizedTimeContext =
    | 'historical'
    | 'current'
    | 'forecast';

/**
 * NORM-konformer einzelner Wetter-Tagesdatensatz.
 * Alle Einheiten sind OS-konform (imperial).
 */
export interface NormalizedWateringData {
    /** Unix epoch Sekunden, normalisiert auf lokale Mitternacht (00:00) */
    timestamp: number;

    /** Ursprünglicher Wetterdienst */
    weatherProvider: string;

    /** Temperatur in Fahrenheit (Tagesdurchschnitt) */
    temp_f: number;

    /** Relative Luftfeuchtigkeit in Prozent (Tagesdurchschnitt) */
    humidity_pct: number;

    /** Niederschlag in Inches (Tagessumme) */
    precip_in: number;

    // ===== Optional – nur wenn verfügbar (ETo) =====

    /** Minimale Temperatur in Fahrenheit */
    min_temp_f?: number;

    /** Maximale Temperatur in Fahrenheit */
    max_temp_f?: number;

    /** Minimale relative Luftfeuchtigkeit in Prozent */
    min_humidity_pct?: number;

    /** Maximale relative Luftfeuchtigkeit in Prozent */
    max_humidity_pct?: number;

    /** Windgeschwindigkeit in mph (Tagesdurchschnitt, 2 m Höhe) */
    wind_mph?: number;

    /** Solarstrahlung in kWh/m²/Tag */
    solar_radiation_kwh?: number;
}

/**
 * Aktuelle Wetterdaten (nicht aggregiert).
 * Wird primär für Rain Delay verwendet.
 */
export interface NormalizedCurrentData {
    /** Unix epoch Sekunden (aktueller Zeitpunkt) */
    timestamp: number;

    /** Temperatur in Fahrenheit */
    temp_f: number;

    /** Relative Luftfeuchtigkeit in Prozent */
    humidity_pct: number;

    /** Aktiver Niederschlag ja/nein */
    raining: boolean;
}

/**
 * Metadaten zur Beschreibung der Normalisierung.
 */
export interface NormalizationMetadata {
    /** Primärer Provider (z. B. "Local", "OpenMeteo", "Hybrid") */
    provider: string;

    /** Herkunft der Daten */
    dataSource: 'local' | 'cloud' | 'hybrid';

    /** IANA-Zeitzone (z. B. "Europe/Berlin") */
    timezone: string;

    /** Geographische Koordinaten */
    coordinates: GeoCoordinates;

    /** Höhe über NN in Metern */
    elevation: number;

    /** Anzahl historischer Tage */
    historicalDays: number;

    /** Anzahl Forecast-Tage */
    forecastDays: number;

    /** Ältester enthaltener Tag */
    oldestDate: Date;

    /** Neuester enthaltener Tag */
    newestDate: Date;

    /** Marker: Datensatz ist NORM-konform */
    normalized: true;
}

/**
 * Komplettes NORM-Datenset.
 */
export interface NormalizedDataSet {
    /**
     * Historische Daten
     * [0 = heute, 1 = gestern, ...]
     */
    historical: readonly NormalizedWateringData[];

    /**
     * Forecast-Daten
     * [0 = heute, 1 = morgen, ...]
     */
    forecast: readonly NormalizedWateringData[];

    /**
     * Aktuelle Wetterdaten (optional)
     */
    current?: NormalizedCurrentData;

    /**
     * Metadaten
     */
    metadata: NormalizationMetadata;
}

/**
 * Ergebnis einer Validierung.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
