const form=document.getElementById('registerTeacherForm');
const messageBox=document.getElementById('message');
const backToLogin=document.getElementById('backToLogin');
const organizationSelect=document.getElementById('organization');
const submitButton=form?.querySelector('button[type="submit"]');

function showMessage(text,type='error'){
    if(!messageBox) return;
    messageBox.textContent=text;
    messageBox.className=`alert ${type}`;
    messageBox.style.display='block';
}

async function submitRequest(e){
    e.preventDefault();

    const formData=new FormData(form);
    const payload={
        name:formData.get('name').trim(),
        email:formData.get('email').trim().toLowerCase(),
        password:formData.get('password'),
        message:formData.get('message')?.trim(),
        organizationId: formData.get('organizationId') || undefined
    };

    if(payload.password.length<8){
        showMessage('Password must be at least 8 characters.');
        return;
    }

    try{
        // First create user and teacher request via API
        const response=await fetch('/api/auth/register-teacher',{
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify(payload)
        });

        const data=await response.json();

        if(!response.ok){
            showMessage(data.message||'Registration failed.');
            return;
        }

        // store token and user
        localStorage.setItem('token',data.token);
        localStorage.setItem('currentUser',JSON.stringify(data.user));

        showMessage(data.message || 'Request submitted. Redirecting...', 'success');
        setTimeout(()=>{
            window.location.href='/dashboard';
        },1200);
    }catch(err){
        console.error(err);
        showMessage('Could not reach the server. Please try again later.');
    }
}

function goBack(){
    window.location.href='/login';
}

form?.addEventListener('submit',submitRequest);
backToLogin?.addEventListener('click',goBack);

async function loadOrganizations(){
    if(!organizationSelect) return;

    try{
        const response=await fetch('/api/organizations/public');
        if(!response.ok) throw new Error('Unable to load organizations');
        const organizations=await response.json();

        organizationSelect.innerHTML='<option value="">Select your organization</option>';

        if(!organizations.length){
            organizationSelect.disabled=true;
            if(submitButton) submitButton.disabled=true;
            return;
        }

        organizations.forEach((org)=>{
            const option=document.createElement('option');
            option.value=org._id;
            option.textContent=org.name;
            organizationSelect.appendChild(option);
        });

        organizationSelect.disabled=false;
        if(submitButton) submitButton.disabled=false;
    }catch(err){
        console.error(err);
        organizationSelect.disabled=true;
        if(submitButton) submitButton.disabled=true;
    }
}

loadOrganizations();
