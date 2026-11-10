/** Distância em km, em linha reta, entre dois pontos. */
export function distanciaKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}
