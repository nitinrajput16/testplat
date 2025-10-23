function qs(){ return new URLSearchParams(window.location.search); }
const form=document.getElementById('resetForm');
const msg=document.getElementById('msg');
const emailInput=document.getElementById('email');
const tokenInput=document.getElementById('token');

function show(text, type='error'){
    msg.textContent=text;
    msg.className=`alert ${type}`;
    msg.style.display='block';
}

document.addEventListener('DOMContentLoaded', ()=>{
    const params=qs();
    const token=params.get('token');
    const email=params.get('email');
    if(!token || !email){
        show('Missing reset token or email in the link.','error');
        form.style.display='none';
        return;
    }
    emailInput.value=email;
    tokenInput.value=token;
});

form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const newPassword=document.getElementById('newPassword').value;
    const confirmPassword=document.getElementById('confirmPassword').value;
    if(newPassword.length<8){ show('Password must be at least 8 characters'); return; }
    if(newPassword!==confirmPassword){ show('Passwords do not match'); return; }

    try{
        const res=await fetch('/api/auth/reset-password',{
            method:'POST', headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ email:emailInput.value, token:tokenInput.value, newPassword })
        });
        const payload=await res.json();
        if(!res.ok){ show(payload.message||'Reset failed'); return; }
        show('Password reset successful. Redirecting to login...','success');
        setTimeout(()=>window.location.href='/login',1200);
    }catch(err){ console.error(err); show('Could not reach server'); }
});
