export const DAY = 86400000;
export function trialState(value, now = Date.now(), days = 7) {
  const first = Number(value?.firstLaunch);
  const last = Number(value?.lastSeen);
  const valid = Number.isFinite(first) && first > 0 && Number.isFinite(last) && last >= first;
  const record = valid ? { firstLaunch: first, lastSeen: Math.max(last, now) } : { firstLaunch: now, lastSeen: now };
  const clockChanged = valid && now < last - 300000;
  const expires = record.firstLaunch + days * DAY;
  return { record, expires, active: !clockChanged && now < expires, clockChanged,
    daysLeft: Math.max(0, Math.ceil((expires - now) / DAY)) };
}
export function entitlementActive(customerInfo, name = 'pro', now = Date.now()) {
  const entitlement = customerInfo?.entitlements?.active?.[name];
  if (customerInfo?.entitlements?.verification === 'FAILED' || entitlement?.verification === 'FAILED') return false;
  if (!entitlement?.isActive) return false;
  const expires = entitlement.expirationDate;
  return expires == null || (Number.isFinite(Date.parse(expires)) && Date.parse(expires) > now);
}
// StoreKit and Play purchases are restored using the store account. No seller key is accepted.
export function purchaseLabel(kind) {
  return kind === 'MONTHLY' ? 'Monthly' : kind === 'ANNUAL' ? 'Yearly' : kind === 'LIFETIME' ? 'Lifetime' : null;
}
export function validatePairingLink(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Paste the complete pairing link shown on your laptop.'); }
  const ip = url.hostname.split('.').map(Number);
  const lan = ip.length === 4 && ip.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (ip[0] === 10 || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31));
  if (url.protocol !== 'http:' || !lan || url.username || url.password || url.hash ||
      url.pathname !== '/ipad.html' || !/^[a-f0-9]{32,128}$/i.test(url.searchParams.get('token') || '')) {
    throw new Error('Use the local Wi-Fi pairing link from Resuvika Omniball on your laptop.');
  }
  return url.href;
}
