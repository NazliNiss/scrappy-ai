export function getStoreUrl(platform, appId) {
  if (!appId) return '#';
  if (platform === 'android') {
    return `https://play.google.com/store/apps/details?id=${appId}`;
  }
  if (platform === 'ios') {
    // Standardize iOS app ID (should be numeric only, e.g. 389801252)
    const cleanId = appId.toLowerCase().startsWith('id') ? appId.substring(2) : appId;
    return `https://apps.apple.com/app/id${cleanId}`;
  }
  return '#';
}
