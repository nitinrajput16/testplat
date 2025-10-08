(function(){
    const yearSpan=document.getElementById('year');
    if(yearSpan){
        yearSpan.textContent=new Date().getFullYear();
    }

    const token=localStorage.getItem('token');
    let currentUser=null;
    try{
        currentUser=JSON.parse(localStorage.getItem('currentUser')||'{}');
    }catch(error){
        console.error('Unable to parse current user for navbar',error);
    }
    const authRequiredItems=document.querySelectorAll('[data-auth="protected"]');
    const guestItems=document.querySelectorAll('[data-auth="guest"]');
    const logoutLink=document.getElementById('logoutLink');
    const dashboardLink=document.getElementById('dashboardLink');

    if(token){
        authRequiredItems.forEach((item)=>{
            item.style.display='inline-block';
        });
        guestItems.forEach((item)=>{
            item.style.display='none';
        });
    }else{
        authRequiredItems.forEach((item)=>{
            item.style.display='none';
        });
        guestItems.forEach((item)=>{
            item.style.display='inline-block';
        });
    }

    if(dashboardLink){
        let target='/dashboard';
        const role=currentUser?.role;
        if(role==='admin' || role==='instructor'){
            target='/dashboard-admin';
        }else if(role==='student'){
            target='/dashboard-student';
        }else if(!token){
            target='/login';
        }
        dashboardLink.href=target;
    }

    if(logoutLink){
        logoutLink.addEventListener('click',(event)=>{
            event.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            window.location.href='/login';
        });
    }
})();
