// ISS orbit data.
//
// A Two-Line Element set (TLE) is a standardized text format that describes a
// satellite's orbit at a specific moment ("epoch"). We hardcode a recent TLE
// for the ISS below so this tutorial stays focused on CesiumJS rather than
// third-party APIs. The orbit drifts ~1–2 km/day from the true position, which
// is imperceptible in a 3D globe view.
//
// To refresh, grab the current ISS (NORAD 25544) TLE from any of:
//   - https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE
//   - https://www.space-track.org (requires a free account)
//   - https://tle.ivanstanojevic.me/api/tle/25544

import { Cartesian3, JulianDate, SampledPositionProperty } from 'cesium';
import * as satellite from 'satellite.js';

export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26113.61927546  .00009382  00000+0  17870-3 0  9990',
  line2: '2 25544  51.6319 210.1816 0006828 342.1779  17.8969 15.48913482563293',
};

/**
 * Propagates the ISS orbit using the SGP4 model (via satellite.js) and returns
 * a CesiumJS SampledPositionProperty that Cesium can interpolate over time.
 *
 * How it works:
 *   1. satellite.js parses the TLE into a "satrec" record.
 *   2. For each sample time, SGP4 gives us the ISS position in an Earth-
 *      Centered Inertial (ECI) frame — a frame that does NOT rotate with Earth.
 *   3. We convert ECI → geodetic (latitude, longitude, altitude) using GMST
 *      (Greenwich Mean Sidereal Time) so the position lines up with the
 *      rotating globe Cesium renders.
 *   4. We add each (time, Cartesian3) sample to a SampledPositionProperty.
 *
 * @param {{ line1: string, line2: string }} tle
 * @param {JulianDate} startTime
 * @param {number} durationSeconds  How far into the future to sample.
 * @param {number} stepSeconds      Sample cadence. Smaller = smoother.
 */
export function sampleIssOrbit(tle, startTime, durationSeconds, stepSeconds) {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const positions = new SampledPositionProperty();

  for (let dt = 0; dt <= durationSeconds; dt += stepSeconds) {
    const time = JulianDate.addSeconds(startTime, dt, new JulianDate());
    const jsDate = JulianDate.toDate(time);

    const eci = satellite.propagate(satrec, jsDate);
    if (!eci.position) continue; // SGP4 can fail for edge cases; skip those

    const gmst = satellite.gstime(jsDate);
    const geo = satellite.eciToGeodetic(eci.position, gmst);

    // satellite.js returns radians for lon/lat and kilometers for altitude.
    const cartesian = Cartesian3.fromRadians(
      geo.longitude,
      geo.latitude,
      geo.height * 1000
    );
    positions.addSample(time, cartesian);
  }

  return positions;
}
