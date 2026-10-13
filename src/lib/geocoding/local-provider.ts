import { prisma } from "../prisma";
import { GeocodingProvider, GeocodeResult } from "./provider";

export class LocalPincodeProvider implements GeocodingProvider {
  name = "LocalIndiaPINCache";

  async geocodePincode(pincode: string): Promise<GeocodeResult | null> {
    const cleanPin = pincode.replace(/\D/g, "").trim();
    if (!cleanPin || cleanPin.length !== 6) {
      return null;
    }

    const cached = await prisma.pincodeGeocache.findUnique({
      where: { pin_code: cleanPin },
    });

    if (cached) {
      return {
        lat: cached.lat,
        lng: cached.lng,
        district: cached.district,
        state: cached.state,
        displayName: `${cleanPin}, ${cached.district || ""}, ${cached.state || ""}`.trim(),
        provider: this.name,
        cached: true,
      };
    }

    return null;
  }

  async geocodeAddress(address: string, pincode?: string): Promise<GeocodeResult | null> {
    // If a pin code is supplied or can be extracted from the address, try local lookup
    let targetPin = pincode;
    if (!targetPin) {
      const pinMatch = address.match(/\b\d{6}\b/);
      if (pinMatch) {
        targetPin = pinMatch[0];
      }
    }

    if (targetPin) {
      return this.geocodePincode(targetPin);
    }

    return null;
  }
}
