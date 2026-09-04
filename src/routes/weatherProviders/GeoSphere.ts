import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { getTZ, httpJSONRequest, localTime } from "../weather";
import { WeatherProvider } from "./WeatherProvider";
import { CodedError, ErrorCode } from "../../errors";
import { format, getUnixTime, startOfDay, subDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { standardizeWindSpeed } from "../adjustmentMethods/EToAdjustmentMethod";
import {
	averageFinite,
	groupByLocalDay,
	maxFinite,
	minFinite,
	sumFinite,
} from "./providerUtils";

// GeoSphere Austria Data Hub – https://dataset.api.hub.geosphere.at (CC-BY 4.0,
// Attribution "GeoSphere Austria" bei Anzeige/Weiterverwendung nötig,
// siehe https://data.hub.geosphere.at).
//
// Zwei unterschiedliche Ressourcen werden kombiniert, da keine einzelne Ressource
// sowohl Vergangenheit als auch Zukunft abdeckt:
// - inca-v1-1h-1km (mode: historical) – echte Analyse-/Messdaten der Vergangenheit,
//   genutzt für getWateringDataInternal() (Zimmerman-Basisdaten).
// - nwp-v2-1h-1km (mode: forecast) – Vorhersagemodell, ~61h Horizont, genutzt für
//   getWeatherDataInternal() (Anzeige/Forecast in der App).
const GEOSPHERE_BASE_URL = "https://dataset.api.hub.geosphere.at/v1";
const FORECAST_RESOURCE = "nwp-v2-1h-1km";
const FORECAST_PARAMETERS = "2t,2r,tp,10u,10v,ssrd,sy";
const HISTORICAL_RESOURCE = "inca-v1-1h-1km";
const HISTORICAL_PARAMETERS = "T2M,RH2M,RR,UU,VV,GL";
const WIND_MEASUREMENT_HEIGHT_FEET = 10 * 3.281;

interface GeosphereTimeseriesResponse {
	timestamps: string[];
	features: Array< {
		properties: {
			parameters: {
				[ key: string ]: {
					data: ( number | null )[];
				};
			};
		};
	} >;
}

interface GeosphereHour {
	timestamp: string;
	temperature: number;
	humidity: number;
	precipitation: number;
	windU: number;
	windV: number;
	solar: number;
	symbol?: number;
}

export default class GeoSphereWeatherProvider extends WeatherProvider {

	public constructor() {
		super();
	}

	/**
	 * Nutzt inca-v1-1h-1km (mode: historical) – ein Analyseprodukt, das Stationsmessungen
	 * und Modell zu einem lückenlosen 1km-Raster kombiniert – für echte Messwerte der
	 * letzten 7 Tage, statt wie zuvor Forecast-Werte als Näherung zu verwenden.
	 */
	protected async getWateringDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WateringData[] > {
		const tz = getTZ( coordinates );
		const hours = await this.fetchHistoricalHours( coordinates );

		if ( hours.length < 20 ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		// Nur vollständige 24h-Kalendertage verwenden.
		const days = groupByLocalDay( hours, hour => hour.timestamp, tz )
			.map( group => group.records )
			.filter( records => records.length === 24 );

		if ( !days.length ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		const data: WateringData[] = [];

		for ( const day of days ) {
			const temp = averageFinite( day.map( hour => hour.temperature ) );
			const humidity = averageFinite( day.map( hour => hour.humidity ) );
			const precip = sumFinite( day.map( hour => hour.precipitation ) );
			const minTemp = minFinite( day.map( hour => hour.temperature ) );
			const maxTemp = maxFinite( day.map( hour => hour.temperature ) );
			const minHumidity = minFinite( day.map( hour => hour.humidity ) );
			const maxHumidity = maxFinite( day.map( hour => hour.humidity ) );
			const wind = averageFinite( day.map( hour => Math.sqrt( hour.windU ** 2 + hour.windV ** 2 ) ) );
			const solar = sumFinite( day.map( hour => hour.solar ) );

			if ( [ temp, humidity, precip, minTemp, maxTemp, minHumidity, maxHumidity, wind, solar ]
				.some( value => !Number.isFinite( value ) ) ) {
				throw new CodedError( ErrorCode.InsufficientWeatherData );
			}

			data.push( {
				weatherProvider: "GeoSphere",
				temp: this.C2F( temp ),
				humidity: humidity,
				precip: this.mm2inch( precip ),
				periodStartTime: getUnixTime( new TZDate( day[ 0 ].timestamp, tz ) ),
				minTemp: this.C2F( minTemp ),
				maxTemp: this.C2F( maxTemp ),
				minHumidity: minHumidity,
				maxHumidity: maxHumidity,
				// GL ist der stündliche Mittelwert in W/m2, daher Summe / 1000 für kWh/m2/Tag.
				solarRadiation: solar / 1000,
				windSpeed: standardizeWindSpeed( this.mps2mph( wind ), WIND_MEASUREMENT_HEIGHT_FEET ),
			} );
		}

		return data.reverse();
	}

	/** Nutzt weiterhin nwp-v2-1h-1km (mode: forecast) für die Anzeige-/Forecast-Daten. */
	protected async getWeatherDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WeatherData > {
		const tz = getTZ( coordinates );
		const hours = await this.fetchForecastHours( coordinates );

		if ( !hours.length ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		const current = hours[ 0 ];
		const { icon, description } = this.mapWeatherSymbol( current.symbol ?? null );

		const weather: WeatherData = {
			weatherProvider: "GeoSphere",
			temp: this.C2F( current.temperature ),
			humidity: current.humidity,
			wind: this.mps2mph( Math.sqrt( current.windU ** 2 + current.windV ** 2 ) ),
			raining: current.precipitation > 0,
			description,
			icon,

			region: "",
			city: "",
			minTemp: 0,
			maxTemp: 0,
			precip: 0,
			forecast: [],
			attribution: {
				name: "GeoSphere Austria",
				url: "https://data.hub.geosphere.at",
			},
		};

		const forecastDays = groupByLocalDay( hours, hour => hour.timestamp, tz );
		if ( !forecastDays.length ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		for ( let day = 0; day < forecastDays.length; day++ ) {
			const records = forecastDays[ day ].records;

			const minTemp = minFinite( records.map( hour => hour.temperature ) );
			const maxTemp = maxFinite( records.map( hour => hour.temperature ) );
			const precip = sumFinite( records.map( hour => hour.precipitation ) );
			if ( ![ minTemp, maxTemp, precip ].every( Number.isFinite ) ) {
				continue;
			}

			// Häufigstes/stärkstes Symbol des Tages für Icon/Description verwenden
			// (einfaches Maximum über den numerischen sy-Code als grobe Näherung).
			const symbol = maxFinite( records.map( hour => hour.symbol ?? 0 ) ) ?? current.symbol ?? 0;
			const { icon: dayIcon, description: dayDescription } = this.mapWeatherSymbol( symbol );

			if ( day === 0 ) {
				weather.minTemp = this.C2F( minTemp );
				weather.maxTemp = this.C2F( maxTemp );
				weather.precip = this.mm2inch( precip );
			}

			weather.forecast.push( {
				temp_min: this.C2F( minTemp ),
				temp_max: this.C2F( maxTemp ),
				precip: this.mm2inch( precip ),
				date: getUnixTime( new TZDate( records[ 0 ].timestamp, tz ) ),
				icon: dayIcon,
				description: dayDescription,
			} );
		}

		return weather;
	}

	public shouldCacheWateringScale(): boolean {
		return true;
	}

	/** Holt die Forecast-Zeitreihe von nwp-v2-1h-1km (siehe FORECAST_PARAMETERS). */
	private async fetchForecastHours( coordinates: GeoCoordinates ): Promise< GeosphereHour[] > {
		const params = new URLSearchParams( {
			parameters: FORECAST_PARAMETERS,
			lat_lon: `${ coordinates[ 0 ] },${ coordinates[ 1 ] }`,
		} );

		const url = `${ GEOSPHERE_BASE_URL }/timeseries/forecast/${ FORECAST_RESOURCE }?${ params.toString() }`;
		const data = await this.fetchTimeseries( url );

		const parameters = data.features[ 0 ].properties.parameters;
		const series = ( name: string ) => parameters[ name ]?.data ?? [];
		const temp = series( "2t" );
		const humidity = series( "2r" );
		const precip = series( "tp" );
		const windU = series( "10u" );
		const windV = series( "10v" );
		const solar = series( "ssrd" );
		const symbol = series( "sy" );

		return data.timestamps.map( ( timestamp, index ) => ( {
			timestamp,
			temperature: temp[ index ],
			humidity: humidity[ index ],
			precipitation: precip[ index ],
			windU: windU[ index ],
			windV: windV[ index ],
			solar: solar[ index ],
			symbol: symbol[ index ],
		} ) ).filter( hour => Number.isFinite( hour.temperature ) ) as GeosphereHour[];
	}

	/**
	 * Holt die historische Zeitreihe von inca-v1-1h-1km (siehe HISTORICAL_PARAMETERS) für
	 * die letzten 7 vollen Kalendertage (analog zum Datumsbereich in DWD.ts).
	 */
	private async fetchHistoricalHours( coordinates: GeoCoordinates ): Promise< GeosphereHour[] > {
		const tz = getTZ( coordinates );
		const currentDay = startOfDay( localTime( coordinates ) );
		const start = format( subDays( currentDay, 7 ), "yyyy-MM-dd'T'HH:mm" );
		const end = format( currentDay, "yyyy-MM-dd'T'HH:mm" );

		const params = new URLSearchParams( {
			parameters: HISTORICAL_PARAMETERS,
			lat_lon: `${ coordinates[ 0 ] },${ coordinates[ 1 ] }`,
			start,
			end,
		} );

		const url = `${ GEOSPHERE_BASE_URL }/timeseries/historical/${ HISTORICAL_RESOURCE }?${ params.toString() }`;
		const data = await this.fetchTimeseries( url );

		const parameters = data.features[ 0 ].properties.parameters;
		const series = ( name: string ) => parameters[ name ]?.data ?? [];
		const temp = series( "T2M" );
		const humidity = series( "RH2M" );
		const precip = series( "RR" );
		const windU = series( "UU" );
		const windV = series( "VV" );
		const solar = series( "GL" );

		return data.timestamps.map( ( timestamp, index ) => ( {
			timestamp,
			temperature: temp[ index ],
			humidity: humidity[ index ],
			precipitation: precip[ index ],
			windU: windU[ index ],
			windV: windV[ index ],
			solar: solar[ index ],
		} ) ).filter( hour => Number.isFinite( hour.temperature ) ) as GeosphereHour[];
	}

	private async fetchTimeseries( url: string ): Promise< GeosphereTimeseriesResponse > {
		let data: GeosphereTimeseriesResponse;
		try {
			data = await httpJSONRequest( url );
		} catch ( err ) {
			console.error( "Error retrieving weather information from GeoSphere Austria:", err );
			throw new CodedError( ErrorCode.WeatherApiError );
		}

		if ( !data || !data.timestamps || !data.features?.[ 0 ] ) {
			throw new CodedError( ErrorCode.MissingWeatherField );
		}

		return data;
	}

	/**
	 * Grobe Zuordnung des GeoSphere-Wettersymbols (Parameter "sy", nur im Forecast
	 * verfügbar) auf OpenWeatherMap-artige Icon-IDs, wie es die anderen Provider (siehe
	 * DWD.ts:getOWMIconCode, OpenMeteo.ts:getWMOIconCode) auch tun.
	 * TODO: gegen die echte GeoSphere-Symbolcodetabelle verifizieren, das hier
	 * ist nur ein Platzhalter-Mapping.
	 */
	private mapWeatherSymbol( symbol: number | null ): { icon: string; description: string } {
		if ( symbol === null || !Number.isFinite( symbol ) ) {
			return { icon: "01d", description: "unbekannt" };
		}
		if ( symbol <= 2 ) {
			return { icon: "01d", description: "klar" };
		}
		if ( symbol <= 5 ) {
			return { icon: "02d", description: "leicht bewölkt" };
		}
		if ( symbol <= 8 ) {
			return { icon: "03d", description: "bewölkt" };
		}
		if ( symbol <= 12 ) {
			return { icon: "10d", description: "Regen" };
		}
		return { icon: "13d", description: "Schnee" };
	}

	// Grad Celsius zu Fahrenheit:
	private C2F( celsius: number ): number {
		return celsius * 1.8 + 32;
	}

	// m/s zu mph:
	private mps2mph( mps: number ): number {
		return mps * 2.23694;
	}

	// mm zu inch:
	private mm2inch( mm: number ): number {
		return mm / 25.4;
	}
}
