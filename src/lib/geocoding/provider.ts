export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName?: string | null;
  provider: string;
  district?: string | null;
  state?: string | null;
  cached?: boolean;
}

export interface GeocodingProvider {
  name: string;
  geocodePincode(pincode: string): Promise<GeocodeResult | null>;
  geocodeAddress(address: string, pincode?: string): Promise<GeocodeResult | null>;
}
