import { GeoCoordinates, WateringData, PWS } from "../../../types";
import { WeatherProvider } from "../WeatherProvider";
import { BaseHybridProvider } from "./BaseHybridProvider";

/**
 * HybridWUndergroundProvider - Combines local PWS data with Weather Underground forecasts.
 * 
 * Weather Underground-specific implementation notes:
 * - WU provides forecast data via getWeatherDataInternal() which includes a forecast array
 * - WU timestamps are at 6 AM UTC, not midnight like other providers
 * - We need to compare DATES not exact timestamps
 */
export default class HybridWUndergroundProvider extends BaseHybridProvider {
    
    constructor(cloudProvider: WeatherProvider) {
        super(cloudProvider, "WUnderground");
    }

    protected async getForecastData(
        coordinates: GeoCoordinates,
        pws: PWS | undefined,
        currentDayEpoch: number
    ): Promise<readonly WateringData[]> {
        
        console.log(`[Hybrid-WU] Fetching forecast data via WeatherData API`);
        
        // Get weather data which includes daily forecast
        const weatherData = await this.cloudProvider.getWeatherDataInternal(coordinates, pws);
        
        // Convert forecast array to WateringData format
        const allForecastData: WateringData[] = weatherData.forecast.map(day => ({
            weatherProvider: "WUnderground",
            periodStartTime: day.date,
            temp: (day.temp_min + day.temp_max) / 2,
            minTemp: day.temp_min,
            maxTemp: day.temp_max,
            humidity: 50,
            minHumidity: 40,
            maxHumidity: 60,
            precip: day.precip,
            solarRadiation: undefined,
            windSpeed: undefined
        }));
        
        console.log(`[Hybrid-WU DEBUG] Converted ${allForecastData.length} forecast days to WateringData`);
        
        if (allForecastData.length > 0) {
            console.log(`[Hybrid-WU DEBUG] First entry periodStartTime: ${allForecastData[0].periodStartTime} (${new Date(allForecastData[0].periodStartTime * 1000).toISOString()})`);
            console.log(`[Hybrid-WU DEBUG] Last entry periodStartTime: ${allForecastData[allForecastData.length-1].periodStartTime} (${new Date(allForecastData[allForecastData.length-1].periodStartTime * 1000).toISOString()})`);
        }
        
        // CRITICAL FIX: WU uses 6 AM UTC timestamps, not midnight
        // We need to compare CALENDAR DAYS, not exact timestamps
        
        // Get current day's date (UTC)
        const currentDayDate = new Date(currentDayEpoch * 1000);
        const currentYear = currentDayDate.getUTCFullYear();
        const currentMonth = currentDayDate.getUTCMonth();
        const currentDay = currentDayDate.getUTCDate();
        
        console.log(`[Hybrid-WU DEBUG] Current day: ${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(currentDay).padStart(2,'0')}`);
        
        // Filter to keep tomorrow onwards (calendar days, not exact times)
        const futureData = allForecastData.filter(data => {
            const forecastDate = new Date(data.periodStartTime * 1000);
            const forecastYear = forecastDate.getUTCFullYear();
            const forecastMonth = forecastDate.getUTCMonth();
            const forecastDay = forecastDate.getUTCDate();
            
            // Keep if forecast is AFTER current day (strictly greater)
            if (forecastYear > currentYear) return true;
            if (forecastYear === currentYear && forecastMonth > currentMonth) return true;
            if (forecastYear === currentYear && forecastMonth === currentMonth && forecastDay > currentDay) return true;
            
            return false;
        });
        
        console.log(`[Hybrid-WU DEBUG] After filtering (tomorrow onwards by calendar day): ${futureData.length} entries`);
        
        if (futureData.length > 0) {
            const firstDate = new Date(futureData[0].periodStartTime * 1000);
            console.log(`[Hybrid-WU DEBUG] First future day: ${firstDate.getUTCFullYear()}-${String(firstDate.getUTCMonth()+1).padStart(2,'0')}-${String(firstDate.getUTCDate()).padStart(2,'0')}, precip=${futureData[0].precip}"`);
        }
        
        return futureData;
    }
}