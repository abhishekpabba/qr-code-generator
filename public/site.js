(function(){
  const cfg=window.SITE_CONFIG||{};
  const consent=localStorage.getItem('qrstudio-consent');
  function loadAnalytics(){if(!cfg.gaId||document.querySelector('[data-ga-loaded]'))return;const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(cfg.gaId);s.dataset.gaLoaded='1';document.head.appendChild(s);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',cfg.gaId,{anonymize_ip:true});}
  function loadAds(){if(!cfg.adsenseClient||document.querySelector('[data-ads-loaded]'))return;const s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(cfg.adsenseClient);s.dataset.adsLoaded='1';document.head.appendChild(s);}
  function applyConsent(v){localStorage.setItem('qrstudio-consent',v);document.querySelector('.cookie')?.classList.remove('show');if(v==='accepted'){loadAnalytics();loadAds();}}
  if(consent==='accepted'){loadAnalytics();loadAds();}
  else if(!consent){document.addEventListener('DOMContentLoaded',()=>document.querySelector('.cookie')?.classList.add('show'));}
  window.qrConsent=applyConsent;
})();
