(function(){
  async function canvasToPngFile(canvas){
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not create QR image')),'image/png'));
    return new File([blob],'qr-code.png',{type:'image/png'});
  }

  async function emailQrWithAttachment(){
    const status=document.getElementById('status');
    try{
      if(typeof window.composedCanvas!=='function') throw new Error('QR image is not ready');
      if(status){status.className='status';status.textContent='Preparing QR image…';}
      const canvas=await window.composedCanvas();
      const file=await canvasToPngFile(canvas);
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        await navigator.share({
          title:'My QR Code',
          text:'My QR Code',
          files:[file]
        });
        if(status) status.textContent='Choose Mail to send the attached QR image.';
        return;
      }
      if(status){status.className='status error';status.textContent='This browser cannot attach files to email automatically. Use Share or download the QR image first.';}
      location.href='mailto:?subject='+encodeURIComponent('My QR Code')+'&body='+encodeURIComponent('Please attach the downloaded QR code image.');
    }catch(err){
      if(err && err.name==='AbortError'){if(status) status.textContent='';return;}
      console.error(err);
      if(status){status.className='status error';status.textContent='Could not prepare the QR attachment. Please try Share instead.';}
    }
  }

  function install(){
    const btn=document.getElementById('emailCode');
    if(!btn) return false;
    btn.textContent='✉ Email QR';
    btn.onclick=emailQrWithAttachment;
    btn.setAttribute('title','Share the QR image to Mail as an attachment');
    return true;
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
  setTimeout(install,500);
})();