import { mapBusiness } from "../mapping/pipeline";
import { resolveGoogleMapsLink } from "../maps-place";
import { GeocodingProvider, GeocodeResult } from "./provider";
import { LocalPincodeProvider } from "./local-provider";
import { NominatimProvider } from "./nominatim-provider";

export class GeocodingService {
  private localProvider: GeocodingProvider;
  private fallbackProvider: GeocodingProvider;

  constructor(
    localProvider: GeocodingProvider = new LocalPincodeProvider(),
    fallbackProvider: GeocodingProvider = new NominatimProvider(),
    private storeMapper: typeof mapBusiness = mapBusiness,
  ) {
    this.localProvider = localProvider;
    this.fallbackProvider = fallbackProvider;
  }

  /**
   * Geocode a lead or store using Tier 1 local pincode lookup first,
   * falling back to Tier 2 Nominatim if necessary.
   */
  async geocode(params: {
    pin_code?: string | null;
    address?: string | null;
    google_map_link?: string | null;
  }): Promise<GeocodeResult | null> {
    const fromLink = await resolveGoogleMapsLink(params.google_map_link);
    if (fromLink) return { ...fromLink, provider: "GoogleMapsPlaceLink" };
    const { pin_code, address } = params;

    // 1. Tier 1: Check Local IndiaPIN Pincode Geocache
    if (pin_code) {
      const cleanPin = pin_code.replace(/\D/g, "").trim();
      if (cleanPin.length === 6) {
        const localResult = await this.localProvider.geocodePincode(cleanPin);
        if (localResult) {
          return localResult;
        }
      }
    }

    // 2. If address contains a 6-digit pincode, attempt local lookup
    if (address) {
      const pinMatch = address.match(/\b\d{6}\b/);
      if (pinMatch) {
        const localResult = await this.localProvider.geocodePincode(
          pinMatch[0],
        );
        if (localResult) {
          return localResult;
        }
      }
    }

    // 3. Tier 2: Nominatim Fallback API
    if (address || pin_code) {
      const fallbackResult = await this.fallbackProvider.geocodeAddress(
        address || "",
        pin_code || undefined,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    return null;
  }

  /**
   * Geocode a store using Google Maps Link first, then the lead mapping pipeline (pincode > name > address > map centroid).
   */
  async geocodeStore(params: {
    name?: string | null;
    address: string;
    pin_code: string;
    google_map_link?: string | null;
  }): Promise<GeocodeResult | null> {
    // A supplied link is an explicit correction: never silently replace it with a PIN centre.
    if (params.google_map_link?.trim()) {
      const point = await resolveGoogleMapsLink(params.google_map_link);
      return point ? { ...point, provider: "GoogleMapsPlaceLink" } : null;
    }
    const result = await this.storeMapper({ company_name: params.name || "", pin_code: params.pin_code, address: params.address });
    return result.status === "ok" ? { ...result.point, provider: result.source } : null;
  }

  /**
   * Batch geocode a list of items with progress callback
   */
  async batchGeocode<
    T extends { pin_code?: string | null; address?: string | null },
  >(
    items: T[],
    onProgress?: (completed: number, total: number, currentItem: T) => void,
  ): Promise<Array<{ item: T; result: GeocodeResult | null }>> {
    const results: Array<{ item: T; result: GeocodeResult | null }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = await this.geocode({
        pin_code: item.pin_code,
        address: item.address,
      });

      results.push({ item, result });

      if (onProgress) {
        onProgress(i + 1, items.length, item);
      }
    }

    return results;
  }
}

export const geocodingService = new GeocodingService();
