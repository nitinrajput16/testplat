const registerForm=document.getElementById('registerForm');
const messageBox=document.getElementById('message');
const backToLogin=document.getElementById('backToLogin');
const yearSpan=document.getElementById('year');
const organizationSelect=document.getElementById('organization');
const organizationHelp=document.getElementById('organizationHelp');
const submitButton=registerForm?.querySelector('button[type="submit"]');

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

async function register(event){
    event.preventDefault();

    const formData=new FormData(registerForm);
    const payload={
        name:formData.get('name').trim(),
        email:formData.get('email').trim().toLowerCase(),
        password:formData.get('password'),
        organizationId:formData.get('organizationId')
    };

    if(payload.password.length<8){
        showMessage('Password must be at least 8 characters.');
        return;
    }

    if(!payload.organizationId){
        showMessage('Please select your organization.');
        return;
    }

    try{
        const response=await fetch('/api/auth/register',{
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify(payload)
        });

        const data=await response.json();

        if(!response.ok){
            showMessage(data.message||'Registration failed. Try a different email.');
            return;
        }

        localStorage.setItem('token',data.token);
        localStorage.setItem('currentUser',JSON.stringify(data.user));
        showMessage('Account created! Redirecting...', 'success');

        setTimeout(()=>{
            const role=data.user?.role;
            if(role==='admin' || role==='instructor'){
                window.location.href='/dashboard-admin';
                return;
            }
            window.location.href='/dashboard-student';
        },1200);
    }catch(error){
        console.error(error);
        showMessage('Could not reach the server. Please try again later.');
    }
}

function goToLogin(){
    window.location.href='/login';
}

registerForm?.addEventListener('submit',register);
backToLogin?.addEventListener('click',goToLogin);

async function loadOrganizations(){
    if(!organizationSelect){
        return;
    }

    try{
        const response=await fetch('/api/organizations/public');
        if(!response.ok){
            throw new Error('Unable to load organizations');
        }

        const organizations=await response.json();

        organizationSelect.innerHTML='<option value="">Select your organization</option>';

        if(!organizations.length){
            organizationSelect.disabled=true;
            if(submitButton){
                submitButton.disabled=true;
            }
            if(organizationHelp){
                organizationHelp.textContent='No organizations are available yet. Please contact your administrator.';
                organizationHelp.classList.add('error');
            }
            return;
        }

        organizations.forEach((organization)=>{
            const option=document.createElement('option');
            option.value=organization._id;
            option.textContent=organization.name;
            organizationSelect.appendChild(option);
        });

        organizationSelect.disabled=false;
        if(submitButton){
            submitButton.disabled=false;
        }
        if(organizationHelp){
            organizationHelp.textContent='Choose the organization provided by your school.';
            organizationHelp.classList.remove('error');
        }
    }catch(error){
        console.error(error);
        organizationSelect.disabled=true;
        if(submitButton){
            submitButton.disabled=true;
        }
        if(organizationHelp){
            organizationHelp.textContent='We could not load organizations. Refresh the page or try again later.';
            organizationHelp.classList.add('error');
        }
    }
}

loadOrganizations();
