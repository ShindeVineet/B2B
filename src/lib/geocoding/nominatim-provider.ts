import {GeocodingProvider,GeocodeResult} from './provider';
import {BoundedNominatim} from '../mapping/nominatim';
import {inIndia} from '../location';
export class NominatimProvider implements GeocodingProvider {
 name='OpenStreetMapNominatim';
 private search=new BoundedNominatim();
 async geocodePincode(pin:string):Promise<GeocodeResult|null>{return this.geocodeAddress('',pin);}
 async geocodeAddress(address:string,pin?:string):Promise<GeocodeResult|null>{const results=await this.search.search([address,pin,'India'].filter(Boolean).join(', '));const result=results.find(inIndia);return result?{lat:result.lat,lng:result.lng,displayName:result.displayName,provider:this.name}:null;}
}
