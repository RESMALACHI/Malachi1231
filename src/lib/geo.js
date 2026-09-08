// Where the phone is, and how far that is from the office.
//
// Used by one feature only: opening the day summary when an agent has left for
// the day (see useAutoDaySummary). Nothing here stores a position — a fix is
// taken, compared to the office, and dropped. There is no location history in
// this app and there should not be one.
//
// A browser cannot watch a geofence in the background: the Geofencing API was
// never shipped by anyone, and watchPosition stops within seconds of the screen
// locking. So this is always sampled while the app is actually open.

const EARTH_M = 6_371_000

/** Metres between two {lat, lng} points (haversine). */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** True when permission has already been granted, without prompting for it. */
export async function hasLocationPermission() {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' })
    return st?.state === 'granted'
  } catch {
    // Safari has no Permissions API for geolocation. Unknown, not denied.
    return null
  }
}

/**
 * One position fix, or null.
 *
 * Resolves null on every failure — denied, timed out, no signal indoors. A
 * feature that quietly does nothing is the right answer here; a location we
 * could not read must never be treated as "left the office".
 */
export function getPosition({ timeout = 10_000, maximumAge = 60_000 } = {}) {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge }
    )
  })
}
