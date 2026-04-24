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

export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26113.61927546  .00009382  00000+0  17870-3 0  9990',
  line2: '2 25544  51.6319 210.1816 0006828 342.1779  17.8969 15.48913482563293',
};
