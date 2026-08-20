(function(){
  const cfg=window.SITE_CONFIG||{};
  const consent=localStorage.getItem('qrstudio-consent');

  function applyLayoutFixes(){
    if(document.getElementById('qr-layout-fixes')) return;
    const style=document.createElement('style');
    style.id='qr-layout-fixes';
    style.textContent=`
      .shell{margin-left:auto!important;margin-right:auto!important;}
      .workspace{margin-left:auto!important;margin-right:auto!important;justify-content:center!important;}
      .features{margin-left:auto!important;margin-right:auto!important;}
      #generator{margin-left:auto!important;margin-right:auto!important;}
      #generate{display:none!important;}
      .actions:has(#generate){display:none!important;}
      @media (min-width:921px){.workspace{width:min(1180px,calc(100% - 48px))!important;}}
      @media (max-width:920px){.workspace{width:min(760px,calc(100% - 28px))!important;}}
    `;
    document.head.appendChild(style);
  }

  function refineGeneratorUI(){
    const generate=document.getElementById('generate');
    if(generate){
      const actions=generate.closest('.actions');
      generate.remove();
      if(actions && !actions.children.length) actions.remove();
    }
    const heroText=document.querySelector('.hero p');
    if(heroText && /Customize shape, size, logo and text/i.test(heroText.textContent)){
      heroText.textContent='Create, customize, and download professional QR codes in seconds.';
    }
  }

  function loadAnalytics(){
    if(!cfg.gaId||document.querySelector('[data-ga-loaded]'))return;
    const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(cfg.gaId);s.dataset.gaLoaded='1';document.head.appendChild(s);
    window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',cfg.gaId,{anonymize_ip:true});
  }

  function loadAds(){
    if(!cfg.adsenseClient||document.querySelector('[data-ads-loaded]'))return;
    const s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(cfg.adsenseClient);s.dataset.adsLoaded='1';document.head.appendChild(s);
  }

  function applyConsent(v){localStorage.setItem('qrstudio-consent',v);document.querySelector('.cookie')?.classList.remove('show');if(v==='accepted'){loadAnalytics();loadAds();}}

  applyLayoutFixes();
  document.addEventListener('DOMContentLoaded',()=>{applyLayoutFixes();refineGeneratorUI();});
  if(document.readyState!=='loading') refineGeneratorUI();

  if(consent==='accepted'){loadAnalytics();loadAds();}
  else if(!consent){document.addEventListener('DOMContentLoaded',()=>document.querySelector('.cookie')?.classList.add('show'));}
  window.qrConsent=applyConsent;
})();
