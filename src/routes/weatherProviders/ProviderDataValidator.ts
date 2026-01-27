import { NormalizedWateringData, ValidationResult, GeoCoordinates } from '../../types';
import { getTZ } from '../weather';
import { TZDate } from '@date-fns/tz';

/**
 * Validiere normalisierte Bewässerungsdaten gemäß NORM-Spezifikation.
 */
export function validateNormalizedData(
    data: readonly NormalizedWateringData[],
    coordinates: GeoCoordinates
): ValidationResult {
    const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
    };

    const timezone = getTZ(coordinates);

    // Check 1: Minimale Datenpunkte
    if (data.length < 7) {
        result.warnings.push(
            `Nur ${data.length} Tage verfügbar, empfohlen sind 7+ für optimale Berechnungen`
        );
    }

    // Check 2: Alle Timestamps sind lokale Mitternacht
    data.forEach((item, i) => {
        const date = new TZDate(item.timestamp * 1000, timezone);
        if (date.getHours() !== 0 || date.getMinutes() !== 0) {
            result.errors.push(
                `Tag ${i}: Timestamp nicht lokale Mitternacht in ${timezone} ` +
                `(erhalten: ${date.toISOString()})`
            );
            result.valid = false;
        }
    });

    // Check 3: Keine Duplikate
    const timestamps = data.map(d => d.timestamp);
    if (new Set(timestamps).size !== timestamps.length) {
        result.errors.push('Doppelte Timestamps gefunden');
        result.valid = false;
    }

    // Check 4: Umgekehrte chronologische Reihenfolge
    for (let i = 1; i < data.length; i++) {
        if (data[i].timestamp >= data[i-1].timestamp) {
            result.errors.push(
                `Tag ${i}: Nicht in umgekehrter Chronologie ` +
                `(${data[i].timestamp} >= ${data[i-1].timestamp})`
            );
            result.valid = false;
        }
    }

    // Check 5: Pflichtfelder vorhanden
    data.forEach((item, i) => {
        if (item.temp_f === undefined || item.humidity_pct === undefined ||
            item.precip_in === undefined) {
            result.errors.push(`Tag ${i}: Pflichtfelder fehlen`);
            result.valid = false;
        }
    });

    // Check 6: Wertebereiche
    data.forEach((item, i) => {
        if (item.temp_f < -40 || item.temp_f > 140) {
            result.errors.push(`Tag ${i}: temp_f außerhalb Bereich: ${item.temp_f}`);
            result.valid = false;
        }
        if (item.humidity_pct < 0 || item.humidity_pct > 100) {
            result.errors.push(`Tag ${i}: humidity_pct außerhalb Bereich: ${item.humidity_pct}`);
            result.valid = false;
        }
        if (item.precip_in < 0) {
            result.errors.push(`Tag ${i}: precip_in negativ: ${item.precip_in}`);
            result.valid = false;
        }
    });

    // Check 7: Konsistenz (min < max)
    data.forEach((item, i) => {
        if (item.min_temp_f !== undefined && item.max_temp_f !== undefined) {
            if (item.min_temp_f > item.max_temp_f) {
                result.errors.push(
                    `Tag ${i}: min_temp > max_temp ` +
                    `(${item.min_temp_f} > ${item.max_temp_f})`
                );
                result.valid = false;
            }
        }
        if (item.min_humidity_pct !== undefined && item.max_humidity_pct !== undefined) {
            if (item.min_humidity_pct > item.max_humidity_pct) {
                result.errors.push(
                    `Tag ${i}: min_humidity > max_humidity ` +
                    `(${item.min_humidity_pct} > ${item.max_humidity_pct})`
                );
                result.valid = false;
            }
        }
    });

    // Check 8: Große Lücken Warnung
    for (let i = 1; i < data.length; i++) {
        const gap = Math.abs(data[i-1].timestamp - data[i].timestamp);
        const gapHours = gap / 3600;
        if (gapHours > 36) {
            result.warnings.push(
                `Große Lücke zwischen Tag ${i-1} und ${i}: ${gapHours.toFixed(1)} Stunden`
            );
        }
    }

    return result;
}

/**
 * Validiere dass Daten alle für ETo-Berechnung erforderlichen Felder haben.
 */
export function validateEToData(data: readonly NormalizedWateringData[]): ValidationResult {
    const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
    };

    const requiredFields = [
        'min_temp_f', 'max_temp_f',
        'min_humidity_pct', 'max_humidity_pct',
        'wind_mph', 'solar_radiation_kwh'
    ];

    data.forEach((item, i) => {
        requiredFields.forEach(field => {
            if (item[field] === undefined || item[field] === null) {
                result.errors.push(`Tag ${i}: ETo Feld '${field}' fehlt`);
                result.valid = false;
            }
        });
    });

    if (!result.valid) {
        result.errors.push('ETo Berechnung nicht möglich - Pflichtfelder fehlen');
    }

    return result;
}

console.log(`[ProviderDataValidator] Provider data valid`);