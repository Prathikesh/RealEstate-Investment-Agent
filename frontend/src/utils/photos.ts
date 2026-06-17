/**
 * Upgrades thumbnail URLs to higher-resolution variants.
 * Also routes through the backend proxy to bypass CDN hotlink protection.
 */
export function upgradePhotoUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined

  // Centris media resize service — bump dimensions to full-size
  if (url.includes('mspublic.centris.ca/media.ashx') || url.includes('centris.ca/media.ashx')) {
    url = url
      .replace(/([?&])w=\d+/, '$1w=1200')
      .replace(/([?&])h=\d+/, '$1h=900')
  }

  // Route all external images through backend proxy to avoid hotlink/CORS blocks
  return `/api/images/proxy?url=${encodeURIComponent(url)}`
}
