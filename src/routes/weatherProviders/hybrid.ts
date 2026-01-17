import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { WeatherProvider } from "./WeatherProvider";
import LocalWeatherProvider from "./local";
import { CodedError, ErrorCode } from "../../errors";
import { getUnixTime, startOfDay } from "date-fns";
import { localTime } from "../weather";

/**
 * HybridWeatherProvider combines local PWS historical data with external forecast data.
 * 
 * Design Philosophy:
 * - HISTORICAL (past): Uses local weather station for accurate, measured data
 * - FORECAST (future): Uses external provider (Apple, OWM, etc.) for predictions
 * 
 * Configuration:
 * - Historical source: Always "local" (hardcoded via LOCAL_PERSISTENCE in .env)
 * - Forecast source: Determined by 'provider' parameter from OpenSprinkler App UI
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
     * Get weather data for display in the mobile app.
     * Uses local station data as primary source, falls back to forecast provider if unavailable.
     */
    protected async getWeatherDataInternal(
        coordinates: GeoCoordinates, 
        pws: PWS | undefined
    ): Promise<WeatherData> {
        try {
            // Try to get current weather from local station first
            return await this.localProvider.getWeatherDataInternal(coordinates, pws);
        } catch (err) {
            console.warn("[HybridWeather] Local weather data unavailable, falling back to forecast provider:", err);
            
            // Fallback to default forecast provider
            const defaultProvider = this.forecastProviders.get('Apple') || 
                                   Array.from(this.forecastProviders.values())[0];
            
            if (!defaultProvider) {
                throw new CodedError(ErrorCode.InsufficientWeatherData);
            }
            
            return await defaultProvider.getWeatherDataInternal(coordinates, pws);
        }
    }

    /**
     * Get watering data combining local historical and external forecast.
     * This is called from weather.ts with the forecast provider name from App UI.
     * 
     * @param coordinates Geographic coordinates
     * @param pws PWS information (used for local station)
     * @param forecastProviderName Name of the forecast provider (from App UI selection)
     * @returns Array of WateringData in reverse chronological order
     */
    public async getWateringDataWithForecastProvider(
        coordinates: GeoCoordinates,
        pws: PWS | undefined,
        forecastProviderName: string
    ): Promise<readonly WateringData[]> {
        
        const currentDay = startOfDay(localTime(coordinates));
        const currentDayEpoch = getUnixTime(currentDay);

        // 1. Get historical data from local weather station
        let historicalData: readonly WateringData[] = [];
        let localDataAvailable = true;
        
        try {
            const localResult = await this.localProvider.getWateringDataInternal(coordinates, pws);
            
            // Filter to only keep historical data (periodStartTime < today)
            historicalData = localResult.filter(data => 
                data.periodStartTime < currentDayEpoch
            );
            
            console.log(`[HybridWeather] Retrieved ${historicalData.length} days of historical data from local station`);
            
        } catch (err) {
            console.warn("[HybridWeather] Local historical data unavailable:", err);
            localDataAvailable = false;
            // Continue without local data - will use forecast for everything
        }

        // 2. Get forecast data from external provider
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
            const forecastResult = await forecastProvider.getWateringDataInternal(coordinates, pws);
            
            // Filter to only keep forecast data (periodStartTime >= today)
            // Note: Some providers include today and historical days, so we filter
            forecastData = forecastResult.filter(data => 
                data.periodStartTime >= currentDayEpoch
            );
            
            console.log(`[HybridWeather] Retrieved ${forecastData.length} days of forecast data from ${forecastProviderName}`);
            
        } catch (err) {
            console.warn(`[HybridWeather] Forecast data from ${forecastProviderName} unavailable:`, err);
            
            if (!localDataAvailable) {
                throw new CodedError(ErrorCode.InsufficientWeatherData);
            }
            
            // If we have local data but no forecast, just return local data
            console.warn("[HybridWeather] Using only local historical data (forecast failed)");
            return historicalData;
        }

        // 3. Combine historical + forecast
        const combinedData = [...historicalData, ...forecastData];
        
        if (combinedData.length === 0) {
            throw new CodedError(ErrorCode.InsufficientWeatherData);
        }

        // 4. Sort by periodStartTime (oldest to newest)
        combinedData.sort((a, b) => a.periodStartTime - b.periodStartTime);
        
        console.log(`[HybridWeather] Combined data: ${historicalData.length} historical + ${forecastData.length} forecast = ${combinedData.length} total days`);
        console.log(`[HybridWeather] Data sources: Historical='local', Forecast='${forecastProviderName}'`);
        
        // 5. Return in reverse chronological order (newest first, as expected by Zimmerman)
        return combinedData.reverse();
    }

    /**
     * Standard getWateringDataInternal implementation.
     * Note: This won't be called directly when using hybrid mode,
     * instead getWateringDataWithForecastProvider is called from weather.ts
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
     * Hybrid provider should cache until end of day since historical data won't change.
     * Forecast data gets refreshed according to the forecast provider's cache settings.
     */
    public shouldCacheWateringScale(): boolean {
        return true;
    }
}
