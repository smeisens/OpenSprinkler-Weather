/**
 * Unit conversion utilities for weather data normalization
 * All functions handle null/undefined gracefully and return the input value if invalid
 */

/**
 * Temperature conversions
 */

export function celsiusToFahrenheit(celsius: number | null | undefined): number | undefined {
    if (celsius === null || celsius === undefined) return undefined;
    return (celsius * 9/5) + 32;
}

export function fahrenheitToCelsius(fahrenheit: number | null | undefined): number | undefined {
    if (fahrenheit === null || fahrenheit === undefined) return undefined;
    return (fahrenheit - 32) * 5/9;
}

export function kelvinToCelsius(kelvin: number | null | undefined): number | undefined {
    if (kelvin === null || kelvin === undefined) return undefined;
    return kelvin - 273.15;
}

export function celsiusToKelvin(celsius: number | null | undefined): number | undefined {
    if (celsius === null || celsius === undefined) return undefined;
    return celsius + 273.15;
}

/**
 * Pressure conversions
 */

export function hpaToInhg(hpa: number | null | undefined): number | undefined {
    if (hpa === null || hpa === undefined) return undefined;
    return hpa * 0.02953;
}

export function inhgToHpa(inhg: number | null | undefined): number | undefined {
    if (inhg === null || inhg === undefined) return undefined;
    return inhg / 0.02953;
}

export function paToHpa(pa: number | null | undefined): number | undefined {
    if (pa === null || pa === undefined) return undefined;
    return pa / 100;
}

export function hpaToPa(hpa: number | null | undefined): number | undefined {
    if (hpa === null || hpa === undefined) return undefined;
    return hpa * 100;
}

export function mbarToHpa(mbar: number | null | undefined): number | undefined {
    // mbar and hPa are equivalent
    return mbar;
}

/**
 * Precipitation conversions
 */

export function mmToInches(mm: number | null | undefined): number | undefined {
    if (mm === null || mm === undefined) return undefined;
    return mm / 25.4;
}

export function inchesToMm(inches: number | null | undefined): number | undefined {
    if (inches === null || inches === undefined) return undefined;
    return inches * 25.4;
}

export function cmToInches(cm: number | null | undefined): number | undefined {
    if (cm === null || cm === undefined) return undefined;
    return cm / 2.54;
}

export function inchesToCm(inches: number | null | undefined): number | undefined {
    if (inches === null || inches === undefined) return undefined;
    return inches * 2.54;
}

/**
 * Wind speed conversions
 */

export function msToMph(ms: number | null | undefined): number | undefined {
    if (ms === null || ms === undefined) return undefined;
    return ms * 2.23694;
}

export function mphToMs(mph: number | null | undefined): number | undefined {
    if (mph === null || mph === undefined) return undefined;
    return mph / 2.23694;
}

export function msToKmh(ms: number | null | undefined): number | undefined {
    if (ms === null || ms === undefined) return undefined;
    return ms * 3.6;
}

export function kmhToMs(kmh: number | null | undefined): number | undefined {
    if (kmh === null || kmh === undefined) return undefined;
    return kmh / 3.6;
}

export function kmhToMph(kmh: number | null | undefined): number | undefined {
    if (kmh === null || kmh === undefined) return undefined;
    return kmh * 0.621371;
}

export function mphToKmh(mph: number | null | undefined): number | undefined {
    if (mph === null || mph === undefined) return undefined;
    return mph / 0.621371;
}

export function knotsToMph(knots: number | null | undefined): number | undefined {
    if (knots === null || knots === undefined) return undefined;
    return knots * 1.15078;
}

export function mphToKnots(mph: number | null | undefined): number | undefined {
    if (mph === null || mph === undefined) return undefined;
    return mph / 1.15078;
}

export function knotsToMs(knots: number | null | undefined): number | undefined {
    if (knots === null || knots === undefined) return undefined;
    return knots * 0.514444;
}

export function msToKnots(ms: number | null | undefined): number | undefined {
    if (ms === null || ms === undefined) return undefined;
    return ms / 0.514444;
}

/**
 * Solar radiation conversions
 */

export function wpm2ToKwh(wpm2: number | null | undefined, hours: number = 1): number | undefined {
    if (wpm2 === null || wpm2 === undefined) return undefined;
    // W/m² * hours / 1000 = kWh/m²
    return (wpm2 * hours) / 1000;
}

export function kwhToWpm2(kwh: number | null | undefined, hours: number = 1): number | undefined {
    if (kwh === null || kwh === undefined) return undefined;
    if (hours === 0) return undefined;
    // kWh/m² * 1000 / hours = W/m²
    return (kwh * 1000) / hours;
}

export function mjm2ToWpm2(mjm2: number | null | undefined, hours: number = 1): number | undefined {
    if (mjm2 === null || mjm2 === undefined) return undefined;
    if (hours === 0) return undefined;
    // MJ/m² = 1,000,000 J/m²
    // W = J/s, so W = J / (hours * 3600)
    // W/m² = MJ/m² * 1,000,000 / (hours * 3600)
    return (mjm2 * 1000000) / (hours * 3600);
}

export function wpm2ToMjm2(wpm2: number | null | undefined, hours: number = 1): number | undefined {
    if (wpm2 === null || wpm2 === undefined) return undefined;
    // MJ/m² = W/m² * hours * 3600 / 1,000,000
    return (wpm2 * hours * 3600) / 1000000;
}

export function langleysToWpm2(langleys: number | null | undefined, hours: number = 1): number | undefined {
    if (langleys === null || langleys === undefined) return undefined;
    if (hours === 0) return undefined;
    // 1 langley = 41840 J/m²
    // W/m² = langleys * 41840 / (hours * 3600)
    return (langleys * 41840) / (hours * 3600);
}

/**
 * Distance conversions
 */

export function kmToMiles(km: number | null | undefined): number | undefined {
    if (km === null || km === undefined) return undefined;
    return km * 0.621371;
}

export function milesToKm(miles: number | null | undefined): number | undefined {
    if (miles === null || miles === undefined) return undefined;
    return miles / 0.621371;
}

export function metersToFeet(meters: number | null | undefined): number | undefined {
    if (meters === null || meters === undefined) return undefined;
    return meters * 3.28084;
}

export function feetToMeters(feet: number | null | undefined): number | undefined {
    if (feet === null || feet === undefined) return undefined;
    return feet / 3.28084;
}

/**
 * Percentage conversions
 */

export function fractionToPercent(fraction: number | null | undefined): number | undefined {
    if (fraction === null || fraction === undefined) return undefined;
    return fraction * 100;
}

export function percentToFraction(percent: number | null | undefined): number | undefined {
    if (percent === null || percent === undefined) return undefined;
    return percent / 100;
}

/**
 * Angle/Direction conversions
 */

export function degreesToRadians(degrees: number | null | undefined): number | undefined {
    if (degrees === null || degrees === undefined) return undefined;
    return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number | null | undefined): number | undefined {
    if (radians === null || radians === undefined) return undefined;
    return radians * (180 / Math.PI);
}

/**
 * Normalize wind direction to 0-360 range
 */
export function normalizeWindDirection(degrees: number | null | undefined): number | undefined {
    if (degrees === null || degrees === undefined) return undefined;
    let normalized = degrees % 360;
    if (normalized < 0) normalized += 360;
    return normalized;
}

/**
 * Utility: Round to specified decimal places
 */
export function roundToDecimals(value: number | null | undefined, decimals: number = 2): number | undefined {
    if (value === null || value === undefined) return undefined;
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Utility: Clamp value between min and max
 */
export function clamp(value: number | null | undefined, min: number, max: number): number | undefined {
    if (value === null || value === undefined) return undefined;
    return Math.min(Math.max(value, min), max);
}

/**
 * Dew point calculation (approximation using Magnus formula)
 */
export function calculateDewPoint(tempC: number, humidity: number): number | undefined {
    if (tempC === null || tempC === undefined || humidity === null || humidity === undefined) {
        return undefined;
    }
    
    // Magnus formula coefficients
    const a = 17.27;
    const b = 237.7;
    
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100);
    const dewPoint = (b * alpha) / (a - alpha);
    
    return roundToDecimals(dewPoint, 1);
}

/**
 * Heat index calculation (feels like temperature)
 * Only valid for temps >= 80°F (27°C) and humidity >= 40%
 */
export function calculateHeatIndex(tempF: number, humidity: number): number | undefined {
    if (tempF === null || tempF === undefined || humidity === null || humidity === undefined) {
        return undefined;
    }
    
    // Simple formula for lower temperatures
    if (tempF < 80) {
        return tempF;
    }
    
    // Rothfusz regression
    const T = tempF;
    const R = humidity;
    
    let HI = -42.379 + 
             2.04901523 * T + 
             10.14333127 * R - 
             0.22475541 * T * R - 
             0.00683783 * T * T - 
             0.05481717 * R * R + 
             0.00122874 * T * T * R + 
             0.00085282 * T * R * R - 
             0.00000199 * T * T * R * R;
    
    // Adjustments
    if (R < 13 && T >= 80 && T <= 112) {
        HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (R > 85 && T >= 80 && T <= 87) {
        HI += ((R - 85) / 10) * ((87 - T) / 5);
    }
    
    return roundToDecimals(HI, 1);
}

/**
 * Wind chill calculation (feels like temperature)
 * Only valid for temps <= 50°F (10°C) and wind >= 3 mph
 */
export function calculateWindChill(tempF: number, windMph: number): number | undefined {
    if (tempF === null || tempF === undefined || windMph === null || windMph === undefined) {
        return undefined;
    }
    
    // Wind chill only applies below 50°F and wind >= 3 mph
    if (tempF > 50 || windMph < 3) {
        return tempF;
    }
    
    // Wind chill formula
    const WC = 35.74 + 
               0.6215 * tempF - 
               35.75 * Math.pow(windMph, 0.16) + 
               0.4275 * tempF * Math.pow(windMph, 0.16);
    
    return roundToDecimals(WC, 1);
}

/**
 * Saturation vapor pressure (es) using Magnus formula
 */
export function calculateSaturationVaporPressure(tempC: number): number | undefined {
    if (tempC === null || tempC === undefined) return undefined;
    
    // Magnus formula: es = 6.112 * exp((17.67 * T) / (T + 243.5))
    const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
    return roundToDecimals(es, 2);
}

/**
 * Actual vapor pressure from relative humidity
 */
export function calculateActualVaporPressure(tempC: number, humidity: number): number | undefined {
    const es = calculateSaturationVaporPressure(tempC);
    if (es === undefined || humidity === null || humidity === undefined) return undefined;
    
    return roundToDecimals((humidity / 100) * es, 2);
}
