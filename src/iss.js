import {
  Cartesian3,
  JulianDate,
  LagrangePolynomialApproximation,
  Matrix3,
  SampledPositionProperty,
  Transforms,
} from 'cesium';

export const NASA_OEM_URL =
  'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
export const NASA_OEM_PROXY_PATH = '/api/nasa-iss-oem';

export const OPEN_NOTIFY_URL = 'http://api.open-notify.org/iss-now.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export async function loadIssTrajectory() {
  let response;
  try {
    response = await fetch(NASA_OEM_PROXY_PATH);
  } catch {
    response = undefined;
  }

  if (!response || !response.ok) {
    // Fallback for environments without the Vite proxy (e.g., server-side tooling).
    response = await fetch(NASA_OEM_URL);
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load NASA trajectory data (${response.status} ${response.statusText}).`
    );
  }

  return parseIssOem(await response.text());
}

export function parseIssOem(text) {
  // Use default (FIXED/ECEF) reference frame — we convert ECI→ECEF ourselves below.
  const positions = new SampledPositionProperty();
  positions.setInterpolationOptions({
    interpolationAlgorithm: LagrangePolynomialApproximation,
    interpolationDegree: 5,
  });

  let creationDate;
  let startTime;
  let stopTime;
  let sampleCount = 0;
  let skippedCount = 0;

  const eciVec = new Cartesian3();
  const ecefVec = new Cartesian3();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('CREATION_DATE')) {
      creationDate = line.split('=').at(1)?.trim();
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}T/.test(line)) continue;

    const [timestamp, xKm, yKm, zKm] = line.split(/\s+/);
    const time = JulianDate.fromIso8601(timestamp);

    // NASA OEM is in EME2000 (J2000-like) inertial frame.
    // Convert to Earth-fixed (ECEF) so Cesium draws the path over the rotating Earth.
    Cartesian3.fromElements(
      Number(xKm) * 1000.0,
      Number(yKm) * 1000.0,
      Number(zKm) * 1000.0,
      eciVec
    );

    const toFixed = Transforms.computeIcrfToFixedMatrix(time);
    if (!toFixed) {
      // ICRF→fixed matrix unavailable for this epoch — skip sample.
      skippedCount += 1;
      continue;
    }

    Matrix3.multiplyByVector(toFixed, eciVec, ecefVec);
    positions.addSample(time, ecefVec.clone());

    if (!startTime) {
      startTime = time.clone();
    }
    stopTime = time.clone();
    sampleCount += 1;
  }

  if (!startTime || !stopTime || sampleCount === 0) {
    throw new Error('NASA OEM file did not contain any usable trajectory samples.');
  }

  if (skippedCount > 0) {
    console.warn(`parseIssOem: skipped ${skippedCount} samples (ICRF matrix unavailable).`);
  }

  return {
    creationDate,
    positions,
    sampleCount,
    startTime,
    stopTime,
  };
}

export async function fetchIssNowSnapshot() {
  const isLocalHttp =
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    LOCAL_HOSTS.has(window.location.hostname);

  if (!isLocalHttp) {
    return {
      available: false,
      reason:
        'Open Notify is HTTP-only, so it is disabled on HTTPS deployments. The app still uses NASA trajectory data.',
      source: 'Open Notify',
    };
  }

  const response = await fetch(OPEN_NOTIFY_URL);
  if (!response.ok) {
    throw new Error(
      `Open Notify request failed (${response.status} ${response.statusText}).`
    );
  }

  const data = await response.json();
  if (data.message !== 'success') {
    throw new Error('Open Notify did not return a success payload.');
  }

  return {
    available: true,
    latitude: Number(data.iss_position.latitude),
    longitude: Number(data.iss_position.longitude),
    source: 'Open Notify',
    timestamp: Number(data.timestamp),
  };
}

export function clampJulianDate(time, startTime, stopTime) {
  if (JulianDate.lessThan(time, startTime)) {
    return startTime.clone();
  }

  if (JulianDate.greaterThan(time, stopTime)) {
    return stopTime.clone();
  }

  return time.clone();
}
