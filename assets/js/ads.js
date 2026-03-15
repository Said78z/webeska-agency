(function initGoogleAdsTracking() {
  const config = window.WEBESKA_CONFIG || {};
  const ads = config.googleAds || {};

  if (!ads.enabled || !ads.id) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ads.id)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', ads.id);
})();
