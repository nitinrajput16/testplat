const loginForm=document.getElementById('loginForm');
const messageBox=document.getElementById('message');
const registerButton=document.getElementById('registerButton');
const forgotRequestBtn=document.getElementById('forgotRequestBtn');
const forgotConfirmBtn=document.getElementById('forgotConfirmBtn');
const forgotEmailInput=document.getElementById('forgotEmail');
const forgotResponse=document.getElementById('forgotResponse');
const yearSpan=document.getElementById('year');

if(yearSpan){
    yearSpan.textContent=new Date().getFullYear();
}

function showMessage(text,type='error'){
    if(!messageBox){
        return;
    }
    messageBox.textContent=text;
    messageBox.className=`alert ${type}`;
    messageBox.style.display='block';
}

function redirectAfterLogin(user){
    if(!user || !user.role){
        window.location.href='/home';
        return;
    }

    if(user.role==='admin' || user.role==='instructor'){
        window.location.href='/dashboard-admin';
        return;
    }

    window.location.href='/dashboard-student';
}

async function login(event){
    event.preventDefault();

    const formData=new FormData(loginForm);
    const email=formData.get('email').trim().toLowerCase();
    const password=formData.get('password');
    const role=formData.get('role');

    if(password.length<8){
        showMessage('Password must be at least 8 characters.');
        return;
    }

    try{
        const response=await fetch('/api/auth/login',{
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ email,password,role })
        });

        const payload=await response.json();

        if(!response.ok){
            showMessage(payload.message||'Login failed. Check your credentials.');
            return;
        }

        localStorage.setItem('token',payload.token);
        localStorage.setItem('currentUser',JSON.stringify(payload.user));
        showMessage('Login successful! Redirecting...', 'success');

        setTimeout(()=>{
            redirectAfterLogin(payload.user);
        },800);
    }catch(error){
        console.error(error);
        showMessage('Could not reach the server. Please try again later.');
    }
}

function redirectToRegistration(){
    window.location.href='/register';
}

loginForm?.addEventListener('submit',login);
registerButton?.addEventListener('click',redirectToRegistration);

forgotRequestBtn?.addEventListener('click',async ()=>{
    const email=(forgotEmailInput?.value||'').trim().toLowerCase();
    if(!email){
        forgotResponse.textContent='Enter your email above.';
        return;
    }
    try{
        forgotRequestBtn.disabled=true;
        const resp=await fetch('/api/auth/password/request',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email }) });
        const data=await resp.json();
        if(!resp.ok){
            forgotResponse.textContent=data.message||'Request failed.';
        }else{
            // token is returned for testing; show short message + token if provided
            forgotResponse.textContent=data.resetToken?`Reset token: ${data.resetToken}`:data.message||'Reset token issued.';
        }
    }catch(err){
        console.error(err);
        forgotResponse.textContent='Failed to reach server.';
    }finally{ forgotRequestBtn.disabled=false; }
});

forgotConfirmBtn?.addEventListener('click',async ()=>{
    const token=prompt('Enter the reset token you received:');
    if(!token){
        return;
    }
    const newPass=prompt('Enter your new password (minimum 8 chars):');
    if(!newPass || newPass.length<8){
        alert('Password must be at least 8 characters.');
        return;
    }
    try{
        forgotConfirmBtn.disabled=true;
        const resp=await fetch('/api/auth/password/confirm',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ token, password: newPass }) });
        const data=await resp.json();
        if(!resp.ok){
            alert(data.message||'Failed to reset password.');
        }else{
            alert('Password reset successful. You can now login with your new password.');
        }
    }catch(err){
        console.error(err);
        alert('Failed to reach server.');
    }finally{ forgotConfirmBtn.disabled=false; }
});
