// Initialize password toggles across all pages
;(function initPasswordToggles(){
    try{
        const toggles = Array.from(document.querySelectorAll('.password-toggle'));
        if(!toggles.length) return;

        toggles.forEach(toggle => {
            // prefer explicit target via data-target attribute
            const targetId = toggle.getAttribute('data-target');
            let input = null;
            if(targetId){
                input = document.getElementById(targetId);
            }
            // fallback: find input inside nearest .password-field
            if(!input){
                const field = toggle.closest('.password-field');
                if(field) input = field.querySelector('input[type="password"], input[type="text"]');
            }
            if(!input) return;

            toggle.addEventListener('click', ()=>{
                const isPassword = input.getAttribute('type') === 'password';
                input.setAttribute('type', isPassword ? 'text' : 'password');
                const icon = toggle.querySelector('i');
                if(icon){
                    icon.classList.toggle('fa-eye');
                    icon.classList.toggle('fa-eye-slash');
                }
                toggle.setAttribute('aria-pressed', String(isPassword));
                toggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
            });
        });
    }catch(e){ /* ignore */ }
})();
