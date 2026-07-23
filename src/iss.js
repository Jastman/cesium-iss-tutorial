import {
  Cartesian3,
  Cartographic,
  JulianDate,
  Math as CesiumMath,
  Matrix3,
  Quaternion,
  SampledPositionProperty,
} from 'cesium';
import {
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';

export const CELESTRAK_TLE_URL =
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
export const OPEN_NOTIFY_URL = 'http://api.open-notify.org/iss-now.json';

const TLE_PROXY_PATH = '/api/iss-tle';
const LIVE_POSITION_PROXY_PATH = '/api/iss-now';
const ISS_ORBIT_SECONDS = 93 * 60;
const SAMPLE_STEP_SECONDS = 15;
const PHASE_SEARCH_STEP_SECONDS = 10;

export async function loadIssData() {
  const [tleText, livePosition] = await Promise.all([
    fetchText(TLE_PROXY_PATH, 'CelesTrak ISS TLE'),
    fetchJson(LIVE_POSITION_PROXY_PATH, 'Open Notify live ISS position'),
  ]);

  return createCalibratedTrajectory(tleText, livePosition);
}

async function fetchText(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status} ${response.statusText}).`);
  }
  return response.text();
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status} ${response.statusText}).`);
  }
  return response.json();
}

export function createCalibratedTrajectory(tleText, livePayload) {
  const { name, satrec } = parseTle(tleText);
  const live = parseLivePosition(livePayload);
  const liveDate = new Date(live.timestamp * 1000);

  const phaseOffsetSeconds = findBestPhaseOffset(satrec, liveDate, live);
  const predictedNow = propagateToFixed(
    satrec,
    new Date(liveDate.getTime() + phaseOffsetSeconds * 1000)
  );
  const liveNow = Cartesian3.fromDegrees(
    live.longitude,
    live.latitude,
    cartographicHeight(predictedNow)
  );
  const calibration = rotationBetween(predictedNow, liveNow);

  const positions = new SampledPositionProperty();
  const startTime = JulianDate.addSeconds(
    JulianDate.fromDate(liveDate),
    -ISS_ORBIT_SECONDS / 2,
    new JulianDate()
  );
  const stopTime = JulianDate.addSeconds(
    JulianDate.fromDate(liveDate),
    ISS_ORBIT_SECONDS / 2,
    new JulianDate()
  );

  let sampleCount = 0;
  for (
    let seconds = -ISS_ORBIT_SECONDS / 2;
    seconds <= ISS_ORBIT_SECONDS / 2;
    seconds += SAMPLE_STEP_SECONDS
  ) {
    const displayDate = new Date(liveDate.getTime() + seconds * 1000);
    const sourceDate = new Date(
      displayDate.getTime() + phaseOffsetSeconds * 1000
    );
    const predicted = propagateToFixed(satrec, sourceDate);
    const calibrated = Matrix3.multiplyByVector(
      calibration,
      predicted,
      new Cartesian3()
    );

    positions.addSample(JulianDate.fromDate(displayDate), calibrated);
    sampleCount += 1;
  }

  return {
    live,
    name,
    phaseOffsetSeconds,
    positions,
    sampleCount,
    startTime,
    stopTime,
  };
}

function parseTle(tleText) {
  const lines = tleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3 || !lines[1].startsWith('1 ') || !lines[2].startsWith('2 ')) {
    throw new Error('CelesTrak did not return a valid three-line ISS TLE.');
  }

  const satrec = twoline2satrec(lines[1], lines[2]);
  if (satrec.error !== 0) {
    throw new Error(`Could not parse the ISS TLE (satellite.js error ${satrec.error}).`);
  }

  return { name: lines[0], satrec };
}

function parseLivePosition(payload) {
  const latitude = Number(payload?.iss_position?.latitude);
  const longitude = Number(payload?.iss_position?.longitude);
  const timestamp = Number(payload?.timestamp);

  if (
    payload?.message !== 'success' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(timestamp)
  ) {
    throw new Error('Open Notify returned an invalid live ISS position.');
  }

  return { latitude, longitude, timestamp };
}

function findBestPhaseOffset(satrec, liveDate, live) {
  const target = Cartesian3.normalize(
    Cartesian3.fromDegrees(live.longitude, live.latitude),
    new Cartesian3()
  );
  let bestOffset = 0;
  let bestAngle = Number.POSITIVE_INFINITY;

  for (
    let offset = -ISS_ORBIT_SECONDS / 2;
    offset <= ISS_ORBIT_SECONDS / 2;
    offset += PHASE_SEARCH_STEP_SECONDS
  ) {
    const candidate = propagateToFixed(
      satrec,
      new Date(liveDate.getTime() + offset * 1000)
    );
    const angle = angularDistance(candidate, target);
    if (angle < bestAngle) {
      bestAngle = angle;
      bestOffset = offset;
    }
  }

  for (let offset = bestOffset - 10; offset <= bestOffset + 10; offset += 0.25) {
    const candidate = propagateToFixed(
      satrec,
      new Date(liveDate.getTime() + offset * 1000)
    );
    const angle = angularDistance(candidate, target);
    if (angle < bestAngle) {
      bestAngle = angle;
      bestOffset = offset;
    }
  }

  return bestOffset;
}

function propagateToFixed(satrec, date) {
  const state = propagate(satrec, date);
  if (!state.position || typeof state.position === 'boolean') {
    throw new Error(`SGP4 could not propagate the ISS position at ${date.toISOString()}.`);
  }

  const geodetic = eciToGeodetic(state.position, gstime(date));
  return Cartesian3.fromRadians(
    geodetic.longitude,
    geodetic.latitude,
    geodetic.height * 1000
  );
}

function angularDistance(left, right) {
  const leftUnit = Cartesian3.normalize(left, new Cartesian3());
  const rightUnit = Cartesian3.normalize(right, new Cartesian3());
  return Math.acos(
    CesiumMath.clamp(Cartesian3.dot(leftUnit, rightUnit), -1, 1)
  );
}

function rotationBetween(from, to) {
  const fromUnit = Cartesian3.normalize(from, new Cartesian3());
  const toUnit = Cartesian3.normalize(to, new Cartesian3());
  const axis = Cartesian3.cross(fromUnit, toUnit, new Cartesian3());
  const axisLength = Cartesian3.magnitude(axis);

  if (axisLength < CesiumMath.EPSILON12) {
    return Matrix3.clone(Matrix3.IDENTITY);
  }

  Cartesian3.divideByScalar(axis, axisLength, axis);
  const angle = angularDistance(fromUnit, toUnit);
  const quaternion = Quaternion.fromAxisAngle(axis, angle);
  return Matrix3.fromQuaternion(quaternion);
}

function cartographicHeight(position) {
  return Cartographic.fromCartesian(position).height;
}
