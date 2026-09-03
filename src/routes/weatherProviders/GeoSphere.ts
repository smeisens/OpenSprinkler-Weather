import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { getTZ, httpJSONRequest, localTime } from "../weather";
import { WeatherProvider } from "./WeatherProvider";
import { CodedError, ErrorCode } from "../../errors";
import { addDays, format, getUnixTime } from "date-fns";
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
// Diese Resource (nwp-v2-1h-1km) liefert AUSSCHLIESSLICH Forecast-Daten
// (Vorhersagehorizont ~61h ab dem aktuellen Referenzzeitpunkt), keine
// historischen Messwerte. getWateringDataInternal() nutzt daher wie
// abgesprochen die hochgerechneten Forecast-Werte als Näherung für die
// Zimmerman-Basisdaten, statt echter TAWES-Stationsmessungen der letzten
// Tage zu laden. Dadurch liefert diese Implementierung in der Praxis meist
// nur 1-2 vollständige Kalendertage statt der bei anderen Providern üblichen
// 7 Tage Historie.
const GEOSPHERE_BASE_URL = "https://dataset.api.hub.geosphere.at/v1";
const GEOSPHERE_RESOURCE = "nwp-v2-1h-1km";
const GEOSPHERE_PARAMETERS = "2t,2r,tp,10u,10v,ssrd,sy";
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
	symbol: number;
}

export default class GeoSphereWeatherProvider extends WeatherProvider {

	public constructor() {
		super();
	}

	protected async getWateringDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WateringData[] > {
		const tz = getTZ( coordinates );
		const hours = await this.fetchHours( coordinates );

		if ( hours.length < 20 ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		// Nur vollständige 24h-Kalendertage verwenden; bei einem ~61h-Forecast-
		// Horizont ist das in der Praxis meist nur 1-2 Tage (siehe Hinweis oben).
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
				// ssrd ist der stündliche Mittelwert in W/m2, daher Summe / 1000 für kWh/m2/Tag
				// (analog zur Berechnung in OpenMeteo.ts).
				solarRadiation: solar / 1000,
				windSpeed: standardizeWindSpeed( this.mps2mph( wind ), WIND_MEASUREMENT_HEIGHT_FEET ),
			} );
		}

		return data.reverse();
	}

	protected async getWeatherDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WeatherData > {
		const tz = getTZ( coordinates );
		const hours = await this.fetchHours( coordinates );

		if ( !hours.length ) {
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		const current = hours[ 0 ];
		const { icon, description } = this.mapWeatherSymbol( current.symbol );

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
			const symbol = maxFinite( records.map( hour => hour.symbol ) ) ?? current.symbol;
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

	/**
	 * Holt die Zeitreihe (Temperatur, Feuchte, Niederschlag, Wind, Solarstrahlung,
	 * Wettersymbol) für die übergebenen Koordinaten und formt sie in ein flaches
	 * Array von Stundenwerten um. Wird von getWateringDataInternal() und
	 * getWeatherDataInternal() gemeinsam genutzt.
	 */
	private async fetchHours( coordinates: GeoCoordinates ): Promise< GeosphereHour[] > {
		const params = new URLSearchParams( {
			parameters: GEOSPHERE_PARAMETERS,
			lat_lon: `${ coordinates[ 0 ] },${ coordinates[ 1 ] }`,
		} );

		const url = `${ GEOSPHERE_BASE_URL }/timeseries/forecast/${ GEOSPHERE_RESOURCE }?${ params.toString() }`;

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
	 * Grobe Zuordnung des GeoSphere-Wettersymbols (Parameter "sy") auf
	 * OpenWeatherMap-artige Icon-IDs, wie es die anderen Provider (siehe
	 * DWD.ts:getOWMIconCode, OpenMeteo.ts:getWMOIconCode) auch tun.
	 * TODO: gegen die echte GeoSphere-Symbolcodetabelle verifizieren, das hier
	 * ist nur ein Platzhalter-Mapping.
	 */
	private mapWeatherSymbol( symbol: number ): { icon: string; description: string } {
		if ( !Number.isFinite( symbol ) ) {
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
