const forgotForm=document.getElementById('forgotForm');
const msgBox=document.getElementById('msg');

function showMsg(text,type='error'){
    msgBox.textContent=text; msgBox.className=`alert ${type}`; msgBox.style.display='block';
}

forgotForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email=document.getElementById('email').value.trim().toLowerCase();
    if(!email){ showMsg('Email required'); return; }
    try{
        const res=await fetch('/api/auth/forgot-password',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email }) });
        const payload=await res.json();
        if(!res.ok){ showMsg(payload.message||'Request failed'); return; }
        if(payload.token){ // dev fallback
            showMsg(`Reset token (dev-only): ${payload.token}`,'success');
            console.log('Reset URL:', payload.resetUrl);
            return;
        }
        showMsg(payload.message||'If that account exists, a reset link was sent','success');
    }catch(err){ console.error(err); showMsg('Could not reach server'); }
});
