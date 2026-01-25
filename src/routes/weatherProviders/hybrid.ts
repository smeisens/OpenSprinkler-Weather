import { GeoCoordinates, WeatherData, WateringData, PWS } from "../../types";
import { WeatherProvider } from "./WeatherProvider";
import { HybridOpenMeteoProvider, HybridAppleProvider, HybridOWMProvider } from "./hybrid-providers";
import { CodedError, ErrorCode } from "../../errors";
import { CachedResult } from "../../cache";

/**
 * HybridWeatherProvider - Factory class that delegates to cloud-specific implementations.
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
 * Architecture:
 * - This is a factory/proxy class that creates the appropriate HybridXxxProvider
 * - Each cloud provider has its own hybrid implementation in the /hybrid folder
 * - All hybrid providers inherit from BaseHybridProvider for common logic
 *
 * Why Hybrid?
 * - Local PWS gives you EXACT past conditions (better than any forecast)
 * - Professional forecasts give you reliable FUTURE predictions (better than extrapolation)
 * - Zimmerman algorithm gets best of both worlds for optimal watering decisions
 */
export default class HybridWeatherProvider extends WeatherProvider {
    private forecastProviders: Map<string, WeatherProvider>;
    private activeHybridProvider: WeatherProvider | null = null;
    private activeProviderName: string | null = null;

    // Cache for combined watering data (historical + forecast)
    private cachedCombinedData: readonly WateringData[] | null = null;
    private cacheCoordinates: GeoCoordinates | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    public constructor(forecastProviders: Map<string, WeatherProvider>) {
        super();
        this.forecastProviders = forecastProviders;
    }

    /**
     * Factory method: Creates the appropriate Hybrid provider based on cloud provider selection.
     *
     * This method is called once per request with the user's selected forecast provider.
     * It instantiates the correct HybridXxxProvider that knows how to handle that specific
     * cloud provider's data format.
     *
     * @param forecastProviderName Name of the cloud provider (from App UI)
     * @returns The appropriate HybridXxxProvider instance
     */
    private createHybridProvider(forecastProviderName: string): WeatherProvider {
        const cloudProvider = this.forecastProviders.get(forecastProviderName);

        if (!cloudProvider) {
            console.error(`[HybridFactory] Cloud provider '${forecastProviderName}' not found, available:`,
                         Array.from(this.forecastProviders.keys()));
            throw new CodedError(ErrorCode.InsufficientWeatherData);
        }

        // Create the appropriate hybrid provider based on cloud provider type
        switch (forecastProviderName) {
            case 'OpenMeteo':
                console.log(`[HybridFactory] Creating HybridOpenMeteoProvider`);
                return new HybridOpenMeteoProvider(cloudProvider);

            case 'Apple':
                console.log(`[HybridFactory] Creating HybridAppleProvider`);
                return new HybridAppleProvider(cloudProvider);

            case 'OWM':
                console.log(`[HybridFactory] Creating HybridOWMProvider`);
                return new HybridOWMProvider(cloudProvider);

            default:
                console.error(`[HybridFactory] No hybrid implementation for provider: ${forecastProviderName}`);
                console.error(`[HybridFactory] Currently supported: OpenMeteo, Apple, OWM`);
                console.error(`[HybridFactory] Please use one of the supported providers or implement Hybrid${forecastProviderName}Provider`);
                throw new CodedError(ErrorCode.InsufficientWeatherData);
        }
    }

    /**
     * Get watering data using the appropriate hybrid provider.
     *
     * This is called from weather.ts with the user's selected forecast provider name.
     * We create (or reuse) the appropriate HybridXxxProvider and delegate to it.
     *
     * @param coordinates Geographic coordinates
     * @param pws PWS information
     * @param forecastProviderName Name of the forecast provider (from App UI selection)
     * @returns Array of WateringData in reverse chronological order (newest first)
     */
    public async getWateringDataWithForecastProvider(
        coordinates: GeoCoordinates,
        pws: PWS | undefined,
        forecastProviderName: string
    ): Promise<readonly WateringData[]> {

        // Create or reuse the hybrid provider for this forecast provider
        if (this.activeProviderName !== forecastProviderName || !this.activeHybridProvider) {
            console.log(`[HybridFactory] Switching to forecast provider: ${forecastProviderName}`);
            this.activeHybridProvider = this.createHybridProvider(forecastProviderName);
            this.activeProviderName = forecastProviderName;
        }

        // Delegate to the concrete hybrid provider and CACHE the result
        const combinedData = await this.activeHybridProvider.getWateringDataInternal(coordinates, pws);

        // Store in cache for later getWateringDataInternal() calls (from Zimmerman)
        this.cachedCombinedData = combinedData;
        this.cacheCoordinates = coordinates;
        this.cacheTimestamp = Date.now();

        console.log(`[HybridFactory] Cached ${combinedData.length} days of combined watering data`);

        return combinedData;
    }

    /**
     * Get current weather data for display in the mobile app and rain delay decisions.
     *
     * Delegates to the active hybrid provider (or creates a default one if none exists).
     * Falls back to Apple if no provider is active yet.
     *
     * @param coordinates Geographic coordinates
     * @param pws PWS information
     * @returns Current weather conditions
     */
    protected async getWeatherDataInternal(
        coordinates: GeoCoordinates,
        pws: PWS | undefined
    ): Promise<WeatherData> {
        // If we don't have an active provider yet, create one with a sensible default
        if (!this.activeHybridProvider) {
            const defaultProvider = 'Apple';
            console.log(`[HybridFactory] No active provider, defaulting to ${defaultProvider} for weather data`);
            this.activeHybridProvider = this.createHybridProvider(defaultProvider);
            this.activeProviderName = defaultProvider;
        }

        return await this.activeHybridProvider.getWeatherDataInternal(coordinates, pws);
    }

    /**
     * Override getWateringData to use our custom cache for combined data.
     *
     * The base class implementation has its own cache, but we need to bypass it
     * because we're caching the COMBINED (historical + forecast) data.
     *
     * This is called by Zimmerman AdjustmentMethod.
     */
    async getWateringData(
        coordinates: GeoCoordinates,
        pws?: PWS
    ): Promise<CachedResult<readonly WateringData[]>> {
        console.log('[HybridFactory] getWateringData() override called!');

        const data = await this.getWateringDataInternal(coordinates, pws);

        console.log(`[HybridFactory] Returning ${data.length} days from getWateringData()`);

        return {
            value: data,
            ttl: Date.now() + this.CACHE_TTL
        };
    }

    /**
     * Standard getWateringDataInternal implementation.
     *
     * IMPORTANT: This is called by Zimmerman AdjustmentMethod via getWateringData()!
     * We return the cached combined data (historical + forecast) that was prepared
     * by getWateringDataWithForecastProvider().
     *
     * If no cached data exists (shouldn't happen in hybrid mode), fallback to local-only data.
     */
    protected async getWateringDataInternal(
        coordinates: GeoCoordinates,
        pws: PWS | undefined
    ): Promise<readonly WateringData[]> {
        // Check if we have valid cached combined data
        const now = Date.now();
        const cacheValid = this.cachedCombinedData &&
                          this.cacheCoordinates &&
                          this.cacheCoordinates[0] === coordinates[0] &&
                          this.cacheCoordinates[1] === coordinates[1] &&
                          (now - this.cacheTimestamp) < this.CACHE_TTL;

        if (cacheValid && this.cachedCombinedData) {
            console.log(`[HybridFactory] Using cached combined watering data (${this.cachedCombinedData.length} days)`);
            return this.cachedCombinedData;
        }

        // No cache available - this shouldn't happen in hybrid mode but handle it gracefully
        console.warn("[HybridFactory] getWateringDataInternal called without cached data - falling back to local-only");

        // Create a default provider if needed
        if (!this.activeHybridProvider) {
            const defaultProvider = 'Apple';
            console.log(`[HybridFactory] Creating default provider: ${defaultProvider}`);
            this.activeHybridProvider = this.createHybridProvider(defaultProvider);
            this.activeProviderName = defaultProvider;
        }

        return await this.activeHybridProvider.getWateringDataInternal(coordinates, pws);
    }

    /**
     * Cache settings for hybrid provider.
     */
    public shouldCacheWateringScale(): boolean {
        return true;
    }
}