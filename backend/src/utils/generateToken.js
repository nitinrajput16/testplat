const jwt=require('jsonwebtoken');
const config=require('../config/config');

function generateToken(user){
    return jwt.sign(
        {
            id:user._id,
            role:user.role
        },
        config.JWT_SECRET,
        {
            expiresIn:config.JWT_EXPIRES_IN
        }
    );
}

module.exports={ generateToken };
