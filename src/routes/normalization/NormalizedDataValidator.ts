import {
    NormalizedDataSet,
    ValidationResult
} from '../../types';

export interface ValidationOptions {
    method: 'zimmerman' | 'eto';
    requireForecast?: boolean;
    minHistoricalDays?: number;
}

export function validateNormalizedData(
    data: NormalizedDataSet,
    options: ValidationOptions
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1️⃣ Basischecks
    if (!data.historical || data.historical.length === 0) {
        errors.push('Keine historischen Daten vorhanden');
    }

    const timestamps = new Set<number>();
    for (const day of data.historical) {
        if (!day.timestamp) {
            errors.push('Fehlender Timestamp in historischen Daten');
        } else if (timestamps.has(day.timestamp)) {
            errors.push(`Doppelter Timestamp: ${day.timestamp}`);
        }
        timestamps.add(day.timestamp);

        if (
            day.temp_f === undefined ||
            day.humidity_pct === undefined ||
            day.precip_in === undefined
        ) {
            errors.push(
                `Pflichtfelder fehlen für ${new Date(day.timestamp * 1000)}`
            );
        }
    }

    // 2️⃣ Methoden-spezifisch
    if (options.method === 'zimmerman') {
        validateZimmerman(data, warnings, options);
    }

    if (options.method === 'eto') {
        validateEto(data, warnings);
    }

    // 3️⃣ Forecast / Restrictions
    if (options.requireForecast && (!data.forecast || data.forecast.length === 0)) {
        warnings.push('Keine Forecast-Daten für Weather Restrictions verfügbar');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

// --- Helpers ----------------------------------------------------

function validateZimmerman(
    data: NormalizedDataSet,
    warnings: string[],
    options: ValidationOptions
) {
    const minDays = options.minHistoricalDays ?? 3;
    if (data.historical.length < minDays) {
        warnings.push(
            `Nur ${data.historical.length} historische Tage vorhanden (empfohlen: ${minDays})`
        );
    }
}

function validateEto(
    data: NormalizedDataSet,
    warnings: string[]
) {
    const requiredFields = [
        'min_temp_f',
        'max_temp_f',
        'min_humidity_pct',
        'max_humidity_pct',
        'wind_mph',
        'solar_radiation_kwh',
        'precip_in'
    ] as const;

    const missingDays = data.historical.filter(day =>
        requiredFields.some(field => (day as any)[field] === undefined)
    );

    if (missingDays.length === data.historical.length) {
        warnings.push('ETo nicht möglich – erforderliche Felder fehlen vollständig');
    } else if (missingDays.length > 0) {
        warnings.push(
            `ETo eingeschränkt – ${missingDays.length} Tage mit fehlenden Feldern`
        );
    }
}
