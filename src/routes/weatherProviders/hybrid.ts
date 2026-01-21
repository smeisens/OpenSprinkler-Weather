import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { WeatherProvider } from "./WeatherProvider";
import LocalWeatherProvider from "./local";
import { CodedError, ErrorCode } from "../../errors";
import { getUnixTime, startOfDay } from "date-fns";
import { localTime } from "../weather";

/**
 * HybridWeatherProvider combines local PWS data with external forecast data.
 * 
 * Design Philosophy:
 * - CURRENT WEATHER (now): Uses local weather station for real-time conditions
 *   → Used for rain delay decisions and current weather display in app
 * - HISTORICAL DATA (past 7 days): Uses local weather station for accurate measurements
 *   → Provides actual temperature, humidity, rainfall, solar, wind from your station
 * - FORECAST DATA (next 7 days): Uses external provider (Apple, OpenMeteo, etc.) for predictions
 *   → Professional forecasts for future watering calculations
 * 
 * Configuration:
 * - Current & Historical source: Always "local" PWS (requires LOCAL_PERSISTENCE=true in .env)
 * - Forecast source: Selected via 'Weather Provider' in OpenSprinkler App UI
 * 
 * Why Hybrid?
 * - Local PWS gives you EXACT past conditions (better than any forecast)
 * - Professional forecasts give you reliable FUTURE predictions (better than extrapolation)
 * - Zimmerman algorithm gets best of both worlds for optimal watering decisions
 */
export default class HybridWeatherProvider extends WeatherProvider {
    private localProvider: LocalWeatherProvider;
    private forecastProviders: Map<string, WeatherProvider>;

    public constructor(forecastProviders: Map<string, WeatherProvider>) {
        super();
        this.localProvider = new LocalWeatherProvider();
        this.forecastProviders = forecastProviders;
    }

    /**
     * Get current weather data for display in the mobile app and rain delay decisions.
     * 
     * This method returns REAL-TIME conditions from your local weather station.
     * It ensures that current rain, temperature, and humidity are from actual measurements,
     * not forecasts. This is critical for accurate rain delay activation.
     * 
     * Data returned represents conditions RIGHT NOW (based on last 24 hours of observations).
     * Falls back to forecast provider only if local station data is unavailable.
     * 
     * @param coordinates Geographic coordinates
     * @param pws PWS information
     * @returns Current weather conditions from local station (or forecast fallback)
     */
    protected async getWeatherDataInternal(
        coordinates: GeoCoordinates, 
        pws: PWS | undefined
    ): Promise<WeatherData> {
        try {
            // Try to get current weather from local station first
            // This ensures rain delay and current conditions use real measurements
            return await this.localProvider.getWeatherDataInternal(coordinates, pws);
        } catch (err) {
            console.warn("[HybridWeather] Local weather data unavailable, falling back to forecast provider:", err);
            
            // Fallback to default forecast provider if local unavailable
            const defaultProvider = this.forecastProviders.get('Apple') || 
                                   Array.from(this.forecastProviders.values())[0];
            
            if (!defaultProvider) {
                throw new CodedError(ErrorCode.InsufficientWeatherData);
            }
            
            return await defaultProvider.getWeatherDataInternal(coordinates, pws);
        }
    }

    /**
     * Get watering data combining local historical measurements with external forecasts.
     * 
     * This is the core method for Zimmerman watering calculations in hybrid mode.
     * It combines the best of both worlds:
     * 
     * LOCAL PWS (past + today):
     * - Day -7 to Day -1: Complete days with actual measurements
     * - Day 0 (today): Partial day with measurements up to current time
     * → These are YOUR exact conditions: temp, humidity, rain, solar, wind
     * 
     * FORECAST PROVIDER (future):
     * - Day +1 to Day +7: Professional weather forecasts
     * → Reliable predictions for upcoming week
     * 
     * Example timeline (if called at 18:00 on Jan 18):
     * - Jan 11-17: Your station's actual measurements (7 complete days)
     * - Jan 18 (00:00-18:00): Your station's measurements for today so far
     * - Jan 19-25: Forecast provider's predictions (7 future days)
     * 
     * The Zimmerman algorithm uses all this data to calculate optimal watering.
     * 
     * @param coordinates Geographic coordinates
     * @param pws PWS information (used for local station)
     * @param forecastProviderName Name of the forecast provider (from App UI selection)
     * @returns Array of WateringData in reverse chronological order (newest first)
     */
    public async getWateringDataWithForecastProvider(
        coordinates: GeoCoordinates,
        pws: PWS | undefined,
        forecastProviderName: string
    ): Promise<readonly WateringData[]> {
        
        const currentDay = startOfDay(localTime(coordinates));
        const currentDayEpoch = getUnixTime(currentDay);

        // 1. Get historical + today's data from local weather station
        let historicalData: readonly WateringData[] = [];
        let localDataAvailable = false;
        
        try {
            const localResult = await this.localProvider.getWateringDataInternal(coordinates, pws);
            
            // Check if we actually got data (not just empty array)
            if (localResult.length > 0) {
                // Local provider returns past 7 days + today (partial day up to now)
                // This is all MEASURED data from your station - keep all of it!
                historicalData = localResult;
                localDataAvailable = true;
                
                console.log(`[HybridWeather] Retrieved ${historicalData.length} days of data from local station (including today)`);
            } else {
                console.warn("[HybridWeather] Local provider returned empty data set");
                localDataAvailable = false;
            }
            
        } catch (err) {
            console.warn("[HybridWeather] Local historical data unavailable:", err);
            localDataAvailable = false;
            // Continue without local data - will use forecast for everything
        }

        // 2. Get forecast data from external provider (selected in App UI)
        let forecastData: readonly WateringData[] = [];
        
        // Determine which forecast provider to use (from App UI selection)
        const forecastProvider = this.forecastProviders.get(forecastProviderName);
        
        if (!forecastProvider) {
            console.error(`[HybridWeather] Forecast provider '${forecastProviderName}' not found, available:`, 
                         Array.from(this.forecastProviders.keys()));
            
            if (!localDataAvailable) {
                throw new CodedError(ErrorCode.InsufficientWeatherData);
            }
            
            // If we have local data but no forecast provider, just return local data
            console.warn("[HybridWeather] Using only local historical data (no forecast available)");
            return historicalData;
        }
        
        try {
            let forecastResult: readonly WateringData[];
            
            // Special handling for OpenMeteo: Use WeatherData forecast instead of historical watering data
            if (forecastProviderName === 'OpenMeteo') {
                console.log(`[HybridWeather] Using OpenMeteo forecast API for future data`);
                
                // Get weather data which includes daily forecast
                const weatherData = await forecastProvider.getWeatherDataInternal(coordinates, pws);
                
                // Convert forecast array to WateringData format
                const convertedForecast: WateringData[] = weatherData.forecast.map(day => ({
                    weatherProvider: "OpenMeteo",
                    periodStartTime: day.date,
                    temp: (day.temp_min + day.temp_max) / 2,  // Average temperature
                    minTemp: day.temp_min,
                    maxTemp: day.temp_max,
                    humidity: 50,  // Default - OpenMeteo daily API doesn't provide hourly humidity averages
                    minHumidity: 40,  // Reasonable defaults
                    maxHumidity: 60,
                    precip: day.precip,
                    solarRadiation: undefined,  // Not available in daily API
                    windSpeed: undefined  // Not available in daily API (could add windspeed_10m_max if needed)
                }));
                
                forecastResult = convertedForecast;
                console.log(`[HybridWeather DEBUG] OpenMeteo converted ${forecastResult.length} forecast days to WateringData`);
            } else {
                // All other providers: use standard getWateringDataInternal
                forecastResult = await forecastProvider.getWateringDataInternal(coordinates, pws);
            }
            
            // DEBUG: Show what we got
            console.log(`[HybridWeather DEBUG] Forecast provider returned ${forecastResult.length} total entries`);
            if (forecastResult.length > 0) {
                console.log(`[HybridWeather DEBUG] First entry periodStartTime: ${forecastResult[0].periodStartTime} (${new Date(forecastResult[0].periodStartTime * 1000).toISOString()})`);
                console.log(`[HybridWeather DEBUG] Last entry periodStartTime: ${forecastResult[forecastResult.length-1].periodStartTime} (${new Date(forecastResult[forecastResult.length-1].periodStartTime * 1000).toISOString()})`);
            }
            console.log(`[HybridWeather DEBUG] Current day epoch: ${currentDayEpoch} (${new Date(currentDayEpoch * 1000).toISOString()})`);
            console.log(`[HybridWeather DEBUG] Tomorrow epoch: ${currentDayEpoch + (24*60*60)} (${new Date((currentDayEpoch + 24*60*60) * 1000).toISOString()})`);
            
            // Filter to only keep FUTURE forecast data (starting tomorrow)
            // We exclude today because we already have real measurements from local PWS
            // This ensures today's data is always actual conditions, not predictions
            const tomorrowEpoch = currentDayEpoch + (24 * 60 * 60);
            forecastData = forecastResult.filter(data => 
                data.periodStartTime >= tomorrowEpoch
            );
            
            console.log(`[HybridWeather DEBUG] After filtering (>= tomorrow): ${forecastData.length} entries`);
            console.log(`[HybridWeather] Retrieved ${forecastData.length} days of forecast data from ${forecastProviderName} (tomorrow onwards)`);
            
            // Additional check: ensure no overlap between historical and forecast
            if (localDataAvailable && historicalData.length > 0 && forecastData.length > 0) {
                const latestHistorical = Math.max(...historicalData.map(d => d.periodStartTime));
                const earliestForecast = Math.min(...forecastData.map(d => d.periodStartTime));
                
                if (earliestForecast <= latestHistorical) {
                    console.warn(`[HybridWeather] Overlap detected! Latest historical: ${new Date(latestHistorical * 1000).toISOString()}, Earliest forecast: ${new Date(earliestForecast * 1000).toISOString()}`);
                    // Filter out any forecast data that overlaps with historical
                    forecastData = forecastData.filter(d => d.periodStartTime > latestHistorical);
                    console.log(`[HybridWeather] After overlap removal: ${forecastData.length} forecast days`);
                }
            }
            
        } catch (err) {
            console.warn(`[HybridWeather] Forecast data from ${forecastProviderName} unavailable:`, err);
            
            if (!localDataAvailable) {
                throw new CodedError(ErrorCode.InsufficientWeatherData);
            }
            
            // If we have local data but no forecast, just return local data
            console.warn("[HybridWeather] Using only local historical data (forecast failed)");
            return historicalData;
        }

        // 3. Combine local measurements + forecast predictions
        const combinedData = [...historicalData, ...forecastData];
        
        if (combinedData.length === 0) {
            console.error("[HybridWeather] No data available from either local or forecast providers");
            throw new CodedError(ErrorCode.InsufficientWeatherData);
        }

        // 4. Sort by periodStartTime (newest first = reverse chronological)
        // This is what the Zimmerman algorithm expects
        combinedData.sort((a, b) => b.periodStartTime - a.periodStartTime);
        
        console.log(`[HybridWeather] Combined data: ${historicalData.length} days (local+today) + ${forecastData.length} days (forecast) = ${combinedData.length} total days`);
        console.log(`[HybridWeather] Data sources: Local PWS (historical+today), ${forecastProviderName} (tomorrow+)`);
        console.log(`[HybridWeather] Date range: ${new Date(combinedData[combinedData.length-1].periodStartTime * 1000).toISOString().split('T')[0]} to ${new Date(combinedData[0].periodStartTime * 1000).toISOString().split('T')[0]}`);
        
        // Return as readonly array (TypeScript requirement)
        return combinedData as readonly WateringData[];
    }

    /**
     * Standard getWateringDataInternal implementation.
     * 
     * Note: This won't be called directly when using hybrid mode.
     * Instead, getWateringDataWithForecastProvider() is called from weather.ts
     * to properly combine local and forecast data.
     * 
     * This method exists as a fallback and returns only local station data.
     */
    protected async getWateringDataInternal(
        coordinates: GeoCoordinates, 
        pws: PWS | undefined
    ): Promise<readonly WateringData[]> {
        // Fallback to just local data if called without forecast provider
        console.warn("[HybridWeather] getWateringDataInternal called without forecast provider, using local only");
        return await this.localProvider.getWateringDataInternal(coordinates, pws);
    }

    /**
     * Cache settings for hybrid provider.
     * 
     * Historical data from local station doesn't change (past is past),
     * so we can cache until end of day. Forecast data gets refreshed
     * according to the forecast provider's own cache settings.
     */
    public shouldCacheWateringScale(): boolean {
        return true;
    }
}
