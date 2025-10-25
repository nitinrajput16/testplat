const token=localStorage.getItem('token');
let cachedProfile=null;
let cachedCurrentUser=null;
let cachedOrganizations=[];

try{
    cachedCurrentUser=JSON.parse(localStorage.getItem('currentUser')||'{}');
}catch(error){
    console.error('Failed to parse cached user for profile page',error);
}

if(!token){
    window.location.href='/login';
}

const messageBox=document.getElementById('profileMessage');
const profileNameDisplay=document.getElementById('profileNameDisplay');
const profileRoleDisplay=document.getElementById('profileRoleDisplay');
const profileEmailDisplay=document.getElementById('profileEmailDisplay');
const profileOrganizationsDisplay=document.getElementById('profileOrganizationsDisplay');
const profileJoinedDisplay=document.getElementById('profileJoinedDisplay');
const profileUpdatedDisplay=document.getElementById('profileUpdatedDisplay');
const profileAvatar=document.getElementById('profileAvatar');
const profileSubheading=document.getElementById('profileSubheading');

const profileUpdateForm=document.getElementById('profileUpdateForm');
const passwordUpdateForm=document.getElementById('passwordUpdateForm');
const becomeTeacherBtn=document.getElementById('becomeTeacherBtn');
const becomeTeacherNote=document.getElementById('becomeTeacherNote');
const profileNameInput=document.getElementById('profileNameInput');
const profileEmailInput=document.getElementById('profileEmailInput');
const profileOrganizationsField=document.getElementById('profileOrganizationsField');
const profileOrganizationsSelect=document.getElementById('profileOrganizationsSelect');
const profileOrganizationsHint=document.getElementById('profileOrganizationsHint');
const SINGLE_ORGANIZATION_HINT='Select the single organization you belong to.';
const MULTI_ORGANIZATION_HINT='Hold Ctrl (or Cmd on Mac) to select multiple organizations.';

const ROLE_LABELS={
    admin:'Administrator',
    instructor:'Instructor',
    student:'Student'
};

function setMessage(text,type='info'){
    if(!messageBox){
        return;
    }
    if(!text){
        messageBox.classList.add('hidden');
        return;
    }
    messageBox.textContent=text;
    messageBox.className=`alert ${type}`;
    messageBox.classList.remove('hidden');
}

async function request(url,{ method='GET', body }={}){
    const options={
        method,
        headers:{
            Authorization:`Bearer ${token}`
        }
    };

    if(body){
        options.headers['Content-Type']='application/json';
        options.body=JSON.stringify(body);
    }

    const response=await fetch(url,options);

    if(response.status===401){
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        window.location.href='/login';
        throw new Error('Session expired.');
    }

    const payload=await response.json().catch(()=>({}));

    if(!response.ok){
        const message=payload?.message || response.statusText || 'Request failed.';
        throw new Error(message);
    }

    return payload;
}

function formatDateTime(value){
    if(!value){
        return '—';
    }
    const date=new Date(value);
    if(Number.isNaN(date.getTime())){
        return '—';
    }
    return date.toLocaleString();
}

function roleLabel(role){
    return ROLE_LABELS[role] || 'User';
}

function updateAvatar(name,email){
    if(!profileAvatar){
        return;
    }
    const source=name || email || '?';
    const initial=source.trim().charAt(0).toUpperCase() || '?';
    profileAvatar.textContent=initial;
}

function renderOrganizationBadges(organizations){
    if(!profileOrganizationsDisplay){
        return;
    }

    profileOrganizationsDisplay.innerHTML='';

    if(!Array.isArray(organizations) || organizations.length===0){
        const span=document.createElement('span');
        span.textContent='Not assigned';
        profileOrganizationsDisplay.appendChild(span);
        return;
    }

    organizations.forEach((organization)=>{
        const chip=document.createElement('span');
        chip.className='profile-chip';
        chip.textContent=organization?.name || 'Organization';
        profileOrganizationsDisplay.appendChild(chip);
    });
}

function configureOrganizationSelectForRole(role){
    if(!profileOrganizationsSelect){
        return;
    }

    const isInstructor=role==='instructor';
    if(isInstructor){
        profileOrganizationsSelect.multiple=false;
        profileOrganizationsSelect.removeAttribute('multiple');
        profileOrganizationsSelect.size=1;
        if(profileOrganizationsHint){
            profileOrganizationsHint.textContent=SINGLE_ORGANIZATION_HINT;
        }
    }else{
        profileOrganizationsSelect.multiple=true;
        profileOrganizationsSelect.setAttribute('multiple','multiple');
        profileOrganizationsSelect.removeAttribute('size');
        if(profileOrganizationsHint){
            profileOrganizationsHint.textContent=MULTI_ORGANIZATION_HINT;
        }
    }
}

function populateOrganizationSelect(selectedIds,role){
    if(!profileOrganizationsSelect){
        return;
    }

    const normalizedIds=(selectedIds||[])
        .map((id)=>{
            if(!id){
                return null;
            }
            if(typeof id==='string'){
                return id;
            }
            if(id.toString){
                return id.toString();
            }
            return null;
        })
        .filter(Boolean);

    const allowMultiple=profileOrganizationsSelect.multiple;
    const selectedSet=new Set(allowMultiple?normalizedIds:normalizedIds.slice(0,1));
    const primarySelection=allowMultiple?null:(normalizedIds[0]||'');
    profileOrganizationsSelect.innerHTML='';

    if(!allowMultiple){
        const placeholder=document.createElement('option');
        placeholder.value='';
        placeholder.textContent='-- Not assigned --';
        placeholder.selected=!primarySelection;
        profileOrganizationsSelect.appendChild(placeholder);
    }

    cachedOrganizations.forEach((organization)=>{
        const option=document.createElement('option');
        option.value=organization._id;
        option.textContent=organization.name || 'Organization';
        if(allowMultiple){
            option.selected=selectedSet.has(organization._id.toString());
        }else{
            option.selected=organization._id.toString()===primarySelection;
        }
        profileOrganizationsSelect.appendChild(option);
    });

    if(profileOrganizationsField){
        profileOrganizationsField.classList.toggle('hidden',cachedOrganizations.length===0);
    }
}

async function ensureOrganizationsLoaded(role,selectedIds){
    if(role!=='admin' && role!=='instructor'){
        if(profileOrganizationsField){
            profileOrganizationsField.classList.add('hidden');
        }
        return;
    }

    try{
        const organizations=await request('/api/organizations');
        cachedOrganizations=Array.isArray(organizations)?organizations:[];
        configureOrganizationSelectForRole(role);
        populateOrganizationSelect(selectedIds,role);
    }catch(error){
        console.error('Failed to load organizations for profile page',error);
        setMessage(error.message,'error');
        if(profileOrganizationsHint){
            profileOrganizationsHint.textContent='Unable to load organizations. Please try again later or contact an administrator.';
        }
    }
}

function updateSubheading(role){
    if(!profileSubheading){
        return;
    }
    switch(role){
    case 'admin':
        profileSubheading.textContent='Manage your administrator identity and organizations linked to your account.';
        break;
    case 'instructor':
        profileSubheading.textContent='Share accurate details so students and fellow instructors can recognise you.';
        break;
    case 'student':
        profileSubheading.textContent='Review your account details and keep your contact information current.';
        break;
    default:
        profileSubheading.textContent='Keep your details up to date so instructors and students know who you are.';
        break;
    }
}

function renderProfile({ user, meta }){
    const profile=user || {};
    cachedProfile=profile;

    if(profileNameDisplay){
        profileNameDisplay.textContent=profile.name || 'Unnamed user';
    }

    if(profileRoleDisplay){
        const label=meta?.roleLabel || roleLabel(profile.role);
        profileRoleDisplay.textContent=label;
    }

    if(profileEmailDisplay){
        profileEmailDisplay.textContent=profile.email || '—';
    }

    renderOrganizationBadges(profile.organizations);

    if(profileJoinedDisplay){
        profileJoinedDisplay.textContent=formatDateTime(profile.createdAt);
    }

    if(profileUpdatedDisplay){
        profileUpdatedDisplay.textContent=formatDateTime(profile.updatedAt);
    }

    updateAvatar(profile.name,profile.email);
    updateSubheading(profile.role);

    if(profileNameInput){
        profileNameInput.value=profile.name || '';
    }

    if(profileEmailInput){
        profileEmailInput.value=profile.email || '';
    }

    if(profile.role==='admin' || profile.role==='instructor'){
        ensureOrganizationsLoaded(profile.role,(profile.organizations||[]).map((organization)=>organization._id));
    }else if(profileOrganizationsField){
        profileOrganizationsField.classList.add('hidden');
    }

    // Show or hide become-teacher action for students
    if(becomeTeacherBtn){
        if(profile.role==='student'){
            becomeTeacherBtn.classList.remove('hidden');
            becomeTeacherNote?.classList.add('hidden');
        }else{
            becomeTeacherBtn.classList.add('hidden');
            becomeTeacherNote?.classList.add('hidden');
        }
    }

    const localUser={
        ...profile,
        meta
    };
    localStorage.setItem('currentUser',JSON.stringify(localUser));
    cachedCurrentUser=localUser;
}

async function loadProfile(){
    try{
        setMessage('Loading your profile…','info');
        const payload=await request('/api/users/me');
        renderProfile(payload);
        setMessage('','info');
    }catch(error){
        console.error('Failed to load profile',error);
        setMessage(error.message,'error');
    }
}

profileUpdateForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();
    if(!cachedProfile){
        return;
    }

    const name=(profileNameInput?.value||'').trim();
    const email=(profileEmailInput?.value||'').trim();

    if(!name){
        setMessage('Name cannot be empty.','error');
        return;
    }

    if(!email){
        setMessage('Email address is required.','error');
        return;
    }

    const body={
        name,
        email
    };

    if(profileOrganizationsField && !profileOrganizationsField.classList.contains('hidden') && profileOrganizationsSelect){
        if(profileOrganizationsSelect.multiple){
            const selected=Array.from(profileOrganizationsSelect.selectedOptions).map((option)=>option.value);
            body.organizationIds=selected;
        }else{
            const value=profileOrganizationsSelect.value;
            body.organizationIds=value?[value]:[];
        }
    }

    try{
        setMessage('Saving your changes…','info');
        const payload=await request('/api/users/me',{ method:'PUT', body });
        renderProfile(payload);
        const successMessage=payload?.message || 'Profile updated successfully.';
        setMessage(successMessage,'success');
    }catch(error){
        console.error('Failed to update profile',error);
        setMessage(error.message,'error');
    }
});

passwordUpdateForm?.addEventListener('submit',async (event)=>{
    event.preventDefault();

    const currentPassword=(document.getElementById('currentPasswordInput')?.value||'').trim();
    const newPassword=(document.getElementById('newPasswordInput')?.value||'').trim();
    const confirmPassword=(document.getElementById('confirmPasswordInput')?.value||'').trim();

    if(!currentPassword || !newPassword || !confirmPassword){
        setMessage('Complete all password fields before updating.','error');
        return;
    }

    if(newPassword.length<8){
        setMessage('New password must be at least 8 characters long.','error');
        return;
    }

    if(newPassword!==confirmPassword){
        setMessage('New password confirmation does not match.','error');
        return;
    }

    try{
        setMessage('Updating password…','info');
        const payload=await request('/api/users/me',{
            method:'PUT',
            body:{
                currentPassword,
                password:newPassword,
                confirmPassword
            }
        });
        const successMessage=payload?.message || 'Password updated successfully.';
        setMessage(successMessage,'success');
        passwordUpdateForm.reset();
    }catch(error){
        console.error('Failed to update password',error);
        setMessage(error.message,'error');
    }
});

loadProfile();

// Handle become teacher request
becomeTeacherBtn?.addEventListener('click',async ()=>{
    if(!confirm('Submit a request to become a teacher? An administrator will review it.')){
        return;
    }
    try{
        becomeTeacherBtn.disabled=true;
        const resp=await request('/api/teacher-requests',{ method:'POST', body:{ message:'' } });
        becomeTeacherNote?.classList.remove('hidden');
        setMessage('Teacher request submitted.','success');
    }catch(error){
        console.error('Teacher request failed',error);
        setMessage(error.message || 'Failed to submit request.','error');
    }finally{
        becomeTeacherBtn.disabled=false;
    }
});
