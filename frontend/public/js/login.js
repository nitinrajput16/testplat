const loginForm=document.getElementById('loginForm');
const messageBox=document.getElementById('message');
const registerButton=document.getElementById('registerButton');
const registerTeacherButton=document.getElementById('registerTeacherButton');
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

function redirectToTeacherRegistration(){
    window.location.href='/register-teacher';
}

loginForm?.addEventListener('submit',login);
registerButton?.addEventListener('click',redirectToRegistration);
registerTeacherButton?.addEventListener('click',redirectToTeacherRegistration);
