/**
 * Temperatur: Fahrenheit → Celsius
 */
export function fahrenheitToCelsius(f: number): number {
    return (f - 32) * (5 / 9);
}

/**
 * Temperatur: Celsius → Fahrenheit
 */
export function celsiusToFahrenheit(c: number): number {
    return (c * (9 / 5)) + 32;
}

/**
 * Niederschlag: Inches → Millimeter
 */
export function inchToMillimeter(inch: number): number {
    return inch * 25.4;
}

/**
 * Niederschlag: Millimeter → Inches
 */
export function millimeterToInch(mm: number): number {
    return mm / 25.4;
}

/**
 * Geschwindigkeit: mph → m/s
 */
export function mphToMetersPerSecond(mph: number): number {
    return mph * 0.44704;
}

/**
 * Geschwindigkeit: m/s → mph
 */
export function metersPerSecondToMph(ms: number): number {
    return ms / 0.44704;
}

/**
 * Solarstrahlung: W/m² → kWh/m²/Tag
 *
 * Annahme:
 * - Tagesmittelwert über 24h
 */
export function wattsPerSquareMeterToKwhPerDay(wm2: number): number {
    return (wm2 * 24) / 1000;
}

/**
 * Solarstrahlung: kWh/m²/Tag → W/m² (Tagesmittel)
 */
export function kwhPerDayToWattsPerSquareMeter(kwh: number): number {
    return (kwh * 1000) / 24;
}
