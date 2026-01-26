/** Geographic coordinates. The 1st element is the latitude, and the 2nd element is the longitude. */
export type GeoCoordinates = [number, number];

/** A PWS ID and API key. */
export type PWS = { id?: string, apiKey: string };

export interface TimeData {
	/** The UTC offset, in minutes. This uses POSIX offsets, which are the negation of typically used offsets
	 * (https://github.com/eggert/tz/blob/2017b/etcetera#L36-L42).
	 */
	timezone: number;
	/** The time of sunrise, in minutes from UTC midnight. */
	sunrise: number;
	/** The time of sunset, in minutes from UTC midnight. */
	sunset: number;
}

export interface WeatherData {
	/** The WeatherProvider that generated this data. */
	weatherProvider: WeatherProviderId;
	/** The current temperature (in Fahrenheit). */
	temp: number;
	/** The current humidity (as a percentage). */
	humidity: number;
	/** The current wind speed (in miles per hour). */
	wind: number;
	/** A flag if it is currently raining. */
	raining: boolean;
	/** A human-readable description of the weather. */
	description: string;
	/** An icon ID that represents the current weather. This will be used in http://openweathermap.org/img/w/<ICON_ID>.png */
	icon: string;
	region: string;
	city: string;
	/** The forecasted minimum temperature for the current day (in Fahrenheit). */
	minTemp: number;
	/** The forecasted minimum temperature for the current day (in Fahrenheit). */
	maxTemp: number;
	/** The forecasted total precipitation for the current day (in inches). */
	precip: number;
	forecast: WeatherDataForecast[]
}

/** The forecasted weather for a specific day in the future. */
export interface WeatherDataForecast {
	/** The forecasted minimum temperature for this day (in Fahrenheit). */
	temp_min: number;
	/** The forecasted maximum temperature for this day (in Fahrenheit). */
	temp_max: number;
	/** The forecaseted precipitation for this day (in inches). */
	precip: number;
	/** The timestamp of the day this forecast is for (in Unix epoch seconds). */
	date: number;
	/** An icon ID that represents the weather at this forecast window. This will be used in http://openweathermap.org/img/w/<ICON_ID>.png */
	icon: string;
	/** A human-readable description of the weather. */
	description: string;
}

/**
 * Data from a set of 24 hour windows that is used to calculate how watering levels should be scaled. This should ideally use
 * as many days of historic data as possible based on the selected provider.
 */

export interface WateringData {
	/** The WeatherProvider that generated this data. */
	weatherProvider: WeatherProviderShortId;
	/** The total precipitation over the window (in inches). */
	precip: number;
	/** The average temperature over the window (in Fahrenheit). */
	temp: number;
	/** The average humidity over the window (as a percentage). */
	humidity: number;
	/** The Unix epoch seconds timestamp of the start of this 24 hour time window. */
	periodStartTime: number;
	/** The minimum temperature over the time period (in Fahrenheit). */
	minTemp: number;
	/** The maximum temperature over the time period (in Fahrenheit). */
	maxTemp: number;
	/** The minimum relative humidity over the time period (as a percentage). */
	minHumidity: number;
	/** The maximum relative humidity over the time period (as a percentage). */
	maxHumidity: number;
	/** The solar radiation, accounting for cloud coverage (in kilowatt hours per square meter per day). */
	solarRadiation: number;
	/**
	 * The average wind speed measured at 2 meters over the time period (in miles per hour). A measurement taken at a
	 * different height can be standardized to 2m using the `standardizeWindSpeed` function in EToAdjustmentMethod.
	 */
	windSpeed: number;
}


/**
 * NORM-konforme Bewässerungsdaten mit standardisierten Einheiten und
 * zeitzonen-bewussten Timestamps.
 *
 * Alle Timestamps sind Unix epoch Sekunden und auf lokale Mitternacht (00:00)
 * normalisiert, basierend auf den Koordinaten.
 */
export interface NormalizedWateringData {
	/** Unix epoch Sekunden, normalisiert auf lokale Mitternacht (00:00) */
	timestamp: number;

	/** Name des Wetterdienstes, aus dem dieser Datensatz stammt */
	weatherProvider: string;

	// =========================
	// Pflicht für ALLE Methoden
	// =========================

	/** Temperatur in Fahrenheit (Tagesdurchschnitt) */
	temp_f: number;

	/** Relative Luftfeuchtigkeit in Prozent (Tagesdurchschnitt) */
	humidity_pct: number;

	/** Niederschlag in Inches (Tagessumme) */
	precip_in: number;

	// =========================
	// Optional – nur für ETo
	// =========================

	/** Minimale Temperatur in Fahrenheit (täglich) */
	min_temp_f?: number;

	/** Maximale Temperatur in Fahrenheit (täglich) */
	max_temp_f?: number;

	/** Minimale relative Luftfeuchtigkeit in Prozent (täglich) */
	min_humidity_pct?: number;

	/** Maximale relative Luftfeuchtigkeit in Prozent (täglich) */
	max_humidity_pct?: number;

	/** Windgeschwindigkeit in mph (Tagesdurchschnitt, 2 m Höhe) */
	wind_mph?: number;

	/** Solarstrahlung in kWh/m²/Tag */
	solar_radiation_kwh?: number;
}

/**
 * Komplettes normalisiertes Datenset mit historischen, aktuellen
 * und Forecast-Daten.
 */
export interface NormalizedDataSet {
	/**
	 * Historische Daten in umgekehrter Chronologie
	 * [0 = heute, 1 = gestern, 2 = vorgestern, …]
	 */
	historical: readonly NormalizedWateringData[];

	/**
	 * Forecast-Daten in chronologischer Reihenfolge
	 * [0 = heute, 1 = morgen, 2 = übermorgen, …]
	 */
	forecast: readonly NormalizedWateringData[];

	/**
	 * Aktuelle Wetterdaten (nicht aggregiert),
	 * primär für Rain Delay / Regen-Erkennung.
	 */
	current?: {
		/** Unix epoch Sekunden (aktueller Zeitpunkt) */
		timestamp: number;

		/** Temperatur in Fahrenheit */
		temp_f: number;

		/** Relative Luftfeuchtigkeit in Prozent */
		humidity_pct: number;

		/** Aktiver Niederschlag ja/nein */
		raining: boolean;
	};

	/** Metadaten zum normalisierten Datenset */
	metadata: NormalizationMetadata;
}

/**
 * Metadaten zur Nachvollziehbarkeit der Normalisierung.
 */
export interface NormalizationMetadata {
	/** Primärer Provider-Name (z. B. “OpenMeteo”, “Local”, “Hybrid”) */
	provider: string;

	/** Art der Datenquelle */
	dataSource: ‘local’ | ‘cloud’ | ‘hybrid’;

	/** IANA Zeitzone (z. B. “Europe/Berlin”) */
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

	/** Marker: Datensatz ist vollständig normalisiert */
	normalized: true;
}

/**
 * Ergebnis einer NORM-Validierung.
 */
export interface ValidationResult {
	/** Ob die Validierung erfolgreich war */
	valid: boolean;

	/** Fehler (blockierend, Methode darf nicht ausgeführt werden) */
	errors: string[];

	/** Warnungen (nicht blockierend) */
	warnings: string[];
}


export type WeatherProviderId = "OWM" | "PirateWeather" | "local" | "hybrid" | "mock" | "WUnderground" | "DWD" | "OpenMeteo" | "AccuWeather" | "Apple";
export type WeatherProviderShortId = "OWM" | "PW" | "local" | "hybrid" | "mock" | "WU" | "DWD" | "OpenMeteo" | "AW" | "Apple";
