function isValidEmail(email){
    return typeof email==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password){
    return typeof password==='string' && password.length>=8;
}

function sanitizeString(value){
    if(typeof value!=='string'){
        return '';
    }

    return value.trim();
}

module.exports={
    isValidEmail,
    validatePassword,
    sanitizeString
};
