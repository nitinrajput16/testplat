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
    const bothitems=document.querySelectorAll('[data-auth="both"]');
    const logoutLink=document.getElementById('logoutLink');
    const dashboardLink=document.getElementById('dashboardLink');

    if(token){
        bothitems.forEach((item)=>{
            item.style.display='inline-block';
        });
        authRequiredItems.forEach((item)=>{
            item.style.display='inline-block';
        });
        guestItems.forEach((item)=>{
            item.style.display='none';
        });
    }else{
        bothitems.forEach((item)=>{
            item.style.display='inline-block';
        });
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

    // Smooth scroll for anchors that point to sections on the landing page.
    // Links use `data-scroll="<id>"` and href already points to `/land#id` as a fallback.
    try{
        const scrollLinks=document.querySelectorAll('a[data-scroll]');
        const currentPath=window.location.pathname.replace(/\/$/,'');

        // On initial load, if there's a hash, attempt to scroll to it smoothly
        if(window.location.hash){
            const id=window.location.hash.replace('#','');
            const el=document.getElementById(id);
            if(el){
                // small timeout to allow page layout to settle
                setTimeout(()=>{
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 60);
            }
        }

        scrollLinks.forEach(link=>{
            link.addEventListener('click', (ev)=>{
                const targetId=link.getAttribute('data-scroll');
                // If already on the landing page, do smooth in-page scroll
                if(currentPath === '/land' || currentPath === '' || currentPath === '/home' || currentPath === '/'){
                    ev.preventDefault();
                    const el=document.getElementById(targetId);
                    if(el){
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }else{
                        // fallback: navigate to hash so browser will try to jump
                        window.location.hash = targetId;
                    }
                    return;
                }
                // Otherwise let the browser navigate to /land#id (href already set). No need to preventDefault.
            });
        });
    }catch(e){
        console.error('Navbar scroll handler error', e);
    }
})();
