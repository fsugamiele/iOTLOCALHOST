const jwt = require('jsonwebtoken');
const User = require('../models/user.js').default;

let checkAuth = (req, res, next) => {

    let token = req.get('token');

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {

        if (err){
            return res.status(401).json({
              status: "error",
              error: err
            });
        }

        req.userData = decoded.userData;

        // 28.x.1 — grants se leen frescos de DB en cada request (NO del JWT).
        // DB como fuente de verdad única; evita permisos congelados al login.
        try {
            const user = await User.findById(req.userData._id).select('grants').lean();
            if (!user) {
                return res.status(401).json({ status: "error", error: "user not found" });
            }
            req.userData.grants = user.grants || [];
            next();
        } catch (dbErr) {
            console.error('[checkAuth] DB error reading grants:', dbErr.message);
            return res.status(500).json({ status: "error", error: "auth-internal" });
        }
    });

}

module.exports = {checkAuth}
