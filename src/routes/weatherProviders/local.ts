import express	from "express";
import fs from "fs";
import { startOfDay, subDays, getUnixTime } from "date-fns";
import { localTime } from "../weather";

import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { WeatherProvider } from "./WeatherProvider";
import { CodedError, ErrorCode } from "../../errors";
import { getParameter } from "../weather";

// ============================================================================
// FIXED: Verwende let statt var, initialisiere lastRainCount mit 0
// ============================================================================
let queue: Array<Observation> = [];
let lastRainEpoch = 0;
let lastRainCount = 0;  // FIXED: War undefined, jetzt 0

const LOCAL_OBSERVATION_DAYS = 7;

// ============================================================================
// FIXED: Rückgabetyp number | undefined (vorher nur number)
// FIXED: Lesbarere Implementierung
// ============================================================================
function getMeasurement(req: express.Request, key: string): number | undefined {
	if (!(key in req.query)) return undefined;

	const value = parseFloat(getParameter(req.query[key]));
	if (isNaN(value) || value === -9999.0) return undefined;

	return value;
}

export const captureWUStream = async function( req: express.Request, res: express.Response ) {
	let rainCount = getMeasurement(req, "dailyrainin");
	const solarRaw = getMeasurement(req, "solarradiation");

	const obs: Observation = {
		timestamp: req.query.dateutc === "now" ? Math.floor(Date.now()/1000) : Math.floor(new Date(String(req.query.dateutc) + "Z").getTime()/1000),
		temp: getMeasurement(req, "tempf"),
		humidity: getMeasurement(req, "humidity"),
		windSpeed: getMeasurement(req, "windspeedmph"),
		solarRadiation: solarRaw !== undefined ? solarRaw * 24 / 1000 : undefined,	// Convert to kWh/m^2 per day
		precip: rainCount !== undefined
			? (rainCount < lastRainCount ? rainCount : rainCount - lastRainCount)
			: undefined,
	};

	const rainin = getMeasurement(req, "rainin");
	lastRainEpoch = rainin !== undefined && rainin > 0 ? obs.timestamp : lastRainEpoch;
	lastRainCount = rainCount !== undefined ? rainCount : lastRainCount;

	queue.unshift(obs);

	res.send( "success\n" );
};

export default class LocalWeatherProvider extends WeatherProvider {

	protected async getWeatherDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WeatherData > {
		// Use local copy to avoid modifying global queue
		const recentQueue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < 24*60*60 );

		if ( recentQueue.length == 0 ) {
			console.error( "There is insufficient data to support Weather response from local PWS." );
			throw "There is insufficient data to support Weather response from local PWS.";
		}

		const latestObs = recentQueue[0];
		const weather: WeatherData = {
			weatherProvider: "local",
			temp: latestObs.temp !== undefined ? Math.floor(latestObs.temp) : undefined,
			minTemp: undefined,
			maxTemp: undefined,
			humidity: latestObs.humidity !== undefined ? Math.floor(latestObs.humidity) : undefined,
			wind: latestObs.windSpeed !== undefined ? Math.floor(latestObs.windSpeed * 10) / 10 : undefined,
			raining: false,
			precip: Math.floor( recentQueue.reduce( ( sum, obs ) => sum + ( obs.precip ?? 0 ), 0) * 100 ) / 100,
			description: "",
			icon: "01d",
			region: undefined,
			city: undefined,
			forecast: []
		};

		if (weather.precip > 0){
			weather.raining = true;
		}

		return weather;
	}

	protected async getWateringDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WateringData[] > {
		// ============================================================================
		// FIXED: Erstelle lokale Kopie statt globale queue zu überschreiben!
		// VORHER: queue = queue.filter(...);
		// NACHHER: const trimmedQueue = queue.filter(...);
		// ============================================================================
		const trimmedQueue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < LOCAL_OBSERVATION_DAYS*24*60*60);

		if ( trimmedQueue.length == 0 || trimmedQueue[0].timestamp - trimmedQueue[trimmedQueue.length-1].timestamp < 23*60*60) {
			console.error( "There is insufficient data to support watering calculation from local PWS." );
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		// 2. Determine day boundaries
		const currentDay = startOfDay(localTime(coordinates));  // today 00:00 local
		const endTime = getUnixTime(currentDay);
		const startTime = getUnixTime(subDays(currentDay, 7));

		// ============================================================================
		// FIXED: Verwende trimmedQueue statt globale queue
		// ============================================================================
		const filteredData = trimmedQueue.filter(obs => obs.timestamp >= startTime && obs.timestamp < endTime);
		const data: WateringData[] = [];

		// 3. Loop over each day from yesterday back to 7 days ago
		let dayEnd = currentDay;
		for (let i = 0; i < 7; i++) {
			let dayStart = subDays(dayEnd, 1);
			// collect observations for [dayStart, dayEnd)
			const dayObs = filteredData.filter(obs => obs.timestamp >= getUnixTime(dayStart) && obs.timestamp < getUnixTime(dayEnd));
			if (dayObs.length === 0) {
				if (i === 0) {
					console.error( "There is insufficient data to support watering calculation from local PWS." );
					throw new CodedError( ErrorCode.InsufficientWeatherData );
				}
				break;  // stop if we hit a gap or ran out of data
			}
			// 4. Calculate daily averages/totals
			let cTemp=0, cHumidity=0, cPrecip=0, cSolar=0, cWind=0;
			const avgTemp = dayObs.reduce((sum, obs) => obs.temp !== undefined && !isNaN(obs.temp) && ++cTemp ? sum + obs.temp : sum, 0) / cTemp;
			const avgHum  = dayObs.reduce((sum, obs) => obs.humidity !== undefined && !isNaN(obs.humidity) && ++cHumidity ? sum + obs.humidity : sum, 0) / cHumidity;
			const totalPrecip = dayObs.reduce((sum, obs) => obs.precip !== undefined && !isNaN(obs.precip) && ++cPrecip ? sum + obs.precip : sum, 0);
			const minTemp = dayObs.reduce((min, obs) => obs.temp !== undefined && min > obs.temp ? obs.temp : min, Infinity);
			const maxTemp = dayObs.reduce((max, obs) => obs.temp !== undefined && max < obs.temp ? obs.temp : max, -Infinity);
			const minHum  = dayObs.reduce((min, obs) => obs.humidity !== undefined && min > obs.humidity ? obs.humidity : min, Infinity);
			const maxHum  = dayObs.reduce((max, obs) => obs.humidity !== undefined && max < obs.humidity ? obs.humidity : max, -Infinity);
			// Solar and Wind are OPTIONAL - many PWS don't have these sensors
			const solarSum = dayObs.reduce((sum, obs) => obs.solarRadiation !== undefined && !isNaN(obs.solarRadiation) && ++cSolar ? sum + obs.solarRadiation : sum, 0);
			const windSum  = dayObs.reduce((sum, obs) => obs.windSpeed !== undefined && !isNaN(obs.windSpeed) && ++cWind ? sum + obs.windSpeed : sum, 0);
			const avgSolar = cSolar > 0 ? solarSum / cSolar : undefined;
			const avgWind  = cWind > 0 ? windSum / cWind : undefined;
			// 5. Verify REQUIRED metrics present (temp, humidity)
			// Precip can be 0 on dry days, so we only check temp and humidity counters
			// Solar and Wind are optional - many PWS don't have these sensors
			if (!(cTemp && cHumidity)
				|| [minTemp, minHum, -maxTemp, -maxHum].includes(Infinity)) {
				if (i === 0) {
					console.error( "There is insufficient data to support watering calculation from local PWS." );
					throw new CodedError( ErrorCode.InsufficientWeatherData );
				}
				break;
			}
			// 6. Create WateringData for this day
			data.push({
				weatherProvider: "local",
				periodStartTime: Math.floor(getUnixTime(dayStart)),  // start of the day (epoch)
				temp: avgTemp,
				humidity: avgHum,
				precip: totalPrecip,
				minTemp: minTemp,
				maxTemp: maxTemp,
				minHumidity: minHum,
				maxHumidity: maxHum,
				solarRadiation: avgSolar,
				windSpeed: avgWind
			});
			dayEnd = dayStart;  // move to previous day
		}
		return data;
	}

}

function saveQueue() {
	queue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < (LOCAL_OBSERVATION_DAYS+1)*24*60*60 );
	try {
		fs.writeFileSync( "observations.json" , JSON.stringify( queue ), "utf8" );
	} catch ( err ) {
		console.error( "Error saving historical observations to local storage.", err );
	}
}

if ( process.env.WEATHER_PROVIDER === "local" && process.env.LOCAL_PERSISTENCE ) {
	if ( fs.existsSync( "observations.json" ) ) {
		try {
			queue = JSON.parse( fs.readFileSync( "observations.json", "utf8" ) );
			queue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < (LOCAL_OBSERVATION_DAYS+1)*24*60*60 );
		} catch ( err ) {
			console.error( "Error reading historical observations from local storage.", err );
			queue = [];
		}
	}
	setInterval( saveQueue, 1000 * 60 * 30 );
}

interface Observation {
	timestamp: number;
	temp: number | undefined;
	humidity: number | undefined;
	windSpeed: number | undefined;
	solarRadiation: number | undefined;  // Optional - many PWS don't have solar sensors
	precip: number | undefined;
}