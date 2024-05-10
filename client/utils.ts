export const trackGAAction = (
  name: string,
  options?: Gtag.EventParams
): void => {
  if (!('gtag' in window)) {
    console.log('GTAG NOT LOADED')
    return
  }

  window.gtag('event', name, {
    event_category: 'premium-users',
    ...options
  })
}
