import test from 'node:test';
import assert from 'node:assert/strict';
import {mapsPlaceCoordinates} from '../src/lib/maps-place';
test('uses explicit Google place coordinates rather than map camera centre',()=>{
 assert.deepEqual(mapsPlaceCoordinates('https://www.google.com/maps/place/Office/@13,78,12z/data=!3d12.9594219!4d77.6558297'),{lat:12.9594219,lng:77.6558297});
 assert.equal(mapsPlaceCoordinates('https://www.google.com/maps/@13,78,12z'),null);
 assert.equal(mapsPlaceCoordinates('https://example.com/maps/data=!3d12!4d77'),null);
 assert.equal(mapsPlaceCoordinates('https://www.google.com/maps/data=!3d77!4d12'),null);
 assert.deepEqual(mapsPlaceCoordinates('https://maps.google.com/?q=12.9,77.6'),{lat:12.9,lng:77.6});
 assert.equal(mapsPlaceCoordinates('https://maps.app.goo.gl/unknown'),null);
});
test('directions use destination longitude/latitude rather than camera',()=>{
 assert.deepEqual(mapsPlaceCoordinates('https://www.google.com/maps/dir//@12.8916552,77.7125578,14z/data=!4m8!2m2!1d77.7186729!2d12.8974241'),{lat:12.8974241,lng:77.7186729});
});
