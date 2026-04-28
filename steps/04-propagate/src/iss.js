// ISS orbit data.
//
// A Two-Line Element set (TLE) is a standardized text format that describes a
// satellite's orbit at a specific moment ("epoch"). We hardcode a recent TLE
// for the ISS below so this tutorial stays focused on CesiumJS rather than
// third-party APIs. The orbit drifts ~1–2 km/day from the true position, which
// is imperceptible in a 3D globe view.

import { Cartesian3, JulianDate, SampledPositionProperty } from 'cesium';
import * as satellite from 'satellite.js';

export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26113.61927546  .00009382  00000+0  17870-3 0  9990',
  line2: '2 25544  51.6319 210.1816 0006828 342.1779  17.8969 15.48913482563293',
};

/**
 * Propagates the ISS orbit with SGP4 (via satellite.js) and returns a
 * SampledPositionProperty Cesium can interpolate over time.
 */
export function sampleIssOrbit(tle, startTime, durationSeconds, stepSeconds) {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const positions = new SampledPositionProperty();

  for (let dt = 0; dt <= durationSeconds; dt += stepSeconds) {
    const time = JulianDate.addSeconds(startTime, dt, new JulianDate());
    const jsDate = JulianDate.toDate(time);

    const eci = satellite.propagate(satrec, jsDate);
    if (!eci.position) continue;

    // ECI (non-rotating) -> geodetic (lat/lon/alt) so it lines up with the
    // rotating globe Cesium renders.
    const gmst = satellite.gstime(jsDate);
    const geo = satellite.eciToGeodetic(eci.position, gmst);

    positions.addSample(
      time,
      Cartesian3.fromRadians(geo.longitude, geo.latitude, geo.height * 1000)
    );
  }

  return positions;
}
