import express	from "express";
import fs from "fs";
import { startOfDay, subDays, getUnixTime } from "date-fns";
import { localTime } from "../weather";

import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { WeatherProvider } from "./WeatherProvider";
import { CodedError, ErrorCode } from "../../errors";
import { getParameter } from "../weather";

var queue: Array<Observation> = [],
	lastRainEpoch = 0,
	lastRainCount: number;

const LOCAL_OBSERVATION_DAYS = 7;

function getMeasurement(req: express.Request, key: string): number {
	let value: number;

	return ( key in req.query ) && !isNaN( value = parseFloat( getParameter(req.query[key]) ) ) && ( value !== -9999.0 ) ? value : undefined;
}

export const captureWUStream = async function( req: express.Request, res: express.Response ) {
	let rainCount = getMeasurement(req, "dailyrainin");

	const obs: Observation = {
		timestamp: req.query.dateutc === "now" ? Math.floor(Date.now()/1000) : Math.floor(new Date(String(req.query.dateutc) + "Z").getTime()/1000),
		temp: getMeasurement(req, "tempf"),
		humidity: getMeasurement(req, "humidity"),
		windSpeed: getMeasurement(req, "windspeedmph"),
		solarRadiation: getMeasurement(req, "solarradiation") * 24 / 1000,	// Convert to kWh/m^2 per day
		precip: rainCount < lastRainCount ? rainCount : rainCount - lastRainCount,
	};

	lastRainEpoch = getMeasurement(req, "rainin") > 0 ? obs.timestamp : lastRainEpoch;
	lastRainCount = isNaN(rainCount) ? lastRainCount : rainCount;

	queue.unshift(obs);

	res.send( "success\n" );
};

export default class LocalWeatherProvider extends WeatherProvider {

	protected async getWeatherDataInternal( coordinates: GeoCoordinates, pws: PWS | undefined ): Promise< WeatherData > {
		queue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < 24*60*60 );

		if ( queue.length == 0 ) {
			console.error( "There is insufficient data to support Weather response from local PWS." );
			throw "There is insufficient data to support Weather response from local PWS.";
		}

		const weather: WeatherData = {
			weatherProvider: "local",
			temp: Math.floor( queue[ 0 ].temp ) || undefined,
			minTemp: undefined,
			maxTemp: undefined,
			humidity: Math.floor( queue[ 0 ].humidity ) || undefined ,
			wind: Math.floor( queue[ 0 ].windSpeed * 10 ) / 10 || undefined,
			raining: false,
			precip: Math.floor( queue.reduce( ( sum, obs ) => sum + ( obs.precip || 0 ), 0) * 100 ) / 100,
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
		// 1. Trim queue to keep only last 7 days of observations
		queue = queue.filter( obs => Math.floor(Date.now()/1000) - obs.timestamp < LOCAL_OBSERVATION_DAYS*24*60*60);
		
		if ( queue.length == 0 || queue[0].timestamp - queue[queue.length-1].timestamp < 23*60*60) {
			console.error( "There is insufficient data to support watering calculation from local PWS." );
			throw new CodedError( ErrorCode.InsufficientWeatherData );
		}

		// 2. Determine day boundaries
		const currentDay = startOfDay(localTime(coordinates));  // today 00:00 local
		const endTime = getUnixTime(currentDay);  // today at midnight (start of today)
		const startTime = getUnixTime(subDays(currentDay, 7));  // 7 days ago at midnight
		
		// Filter to only include data BEFORE today (historical data only)
		// This is perfect for hybrid mode: local station provides past, external provides future
		const filteredData = queue.filter(obs => obs.timestamp >= startTime && obs.timestamp < endTime);
		const data: WateringData[] = [];

		// 3. Loop over each day from yesterday back to 7 days ago
		let dayEnd = currentDay;
		for (let i = 0; i < 7; i++) {
			let dayStart = subDays(dayEnd, 1);
			
			// Collect observations for this day [dayStart, dayEnd)
			const dayObs = filteredData.filter(obs => 
				obs.timestamp >= getUnixTime(dayStart) && obs.timestamp < getUnixTime(dayEnd)
			);
			
			if (dayObs.length === 0) {
				if (i === 0) {
					// No data for yesterday - this is critical
					console.error( "There is insufficient data to support watering calculation from local PWS." );
					throw new CodedError( ErrorCode.InsufficientWeatherData );
				}
				// No data for older days - stop here, return what we have
				break;
			}
			
			// 4. Calculate daily averages/totals
			let cTemp=0, cHumidity=0, cPrecip=0, cSolar=0, cWind=0;
			const avgTemp = dayObs.reduce((sum, obs) => !isNaN(obs.temp) && ++cTemp ? sum + obs.temp : sum, 0) / cTemp;
			const avgHum  = dayObs.reduce((sum, obs) => !isNaN(obs.humidity) && ++cHumidity ? sum + obs.humidity : sum, 0) / cHumidity;
			const totalPrecip = dayObs.reduce((sum, obs) => !isNaN(obs.precip) && ++cPrecip ? sum + obs.precip : sum, 0);
			const minTemp = dayObs.reduce((min, obs) => (min > obs.temp ? obs.temp : min), Infinity);
			const maxTemp = dayObs.reduce((max, obs) => (max < obs.temp ? obs.temp : max), -Infinity);
			const minHum  = dayObs.reduce((min, obs) => (min > obs.humidity ? obs.humidity : min), Infinity);
			const maxHum  = dayObs.reduce((max, obs) => (max < obs.humidity ? obs.humidity : max), -Infinity);
			const avgSolar= dayObs.reduce((sum, obs) => !isNaN(obs.solarRadiation) && ++cSolar ? sum + obs.solarRadiation : sum, 0) / cSolar;
			const avgWind = dayObs.reduce((sum, obs) => !isNaN(obs.windSpeed) && ++cWind ? sum + obs.windSpeed : sum, 0) / cWind;
			
			// 5. Verify all required metrics are present
			if (!(cTemp && cHumidity && cPrecip)
				|| [minTemp, minHum, -maxTemp, -maxHum].includes(Infinity)
				|| !(cSolar && cWind && cPrecip)) {
				if (i === 0) {
					// Missing critical data for yesterday
					console.error( "There is insufficient data to support watering calculation from local PWS." );
					throw new CodedError( ErrorCode.InsufficientWeatherData );
				}
				// Missing data for older days - stop here
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
		
		console.log(`[LocalWeather] Returning ${data.length} days of historical data`);
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
	temp: number;
	humidity: number;
	windSpeed: number;
	solarRadiation: number;
	precip: number;
}
