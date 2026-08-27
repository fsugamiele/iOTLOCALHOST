const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const axios = require("axios");
const crypto = require("crypto");
const { checkAuth } = require("../middlewares/authentication.js");
const { resolveScopedDIdsWithOwner } = require("../middlewares/scope.js");

const hashPassword = (pwd) => crypto.createHash("sha256").update(pwd).digest("hex");

//models import
import User from "../models/user.js";
import EmqxAuthRule from "../models/emqx_auth.js";

//POST -> req.body
//GET -> req.query

//******************
//**** A P I *******
//******************

//LOGIN
router.post("/login", async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ status: "error", error: "Email and password are required" });
    }

    var user = await User.findOne({ email: email });

    //if no email
    if (!user) {
      const response = {
        status: "error",
        error: "Invalid Credentials"
      };
      return res.status(401).json(response);
    }

    //if email and email ok
    if (bcrypt.compareSync(password, user.password)) {
      user.set("password", undefined, { strict: false });

      // 28.x.1 — JWT lleva SOLO identidad, no grants. Los grants se leen frescos
      // de DB en cada request (checkAuth), DB como fuente de verdad única.
      const tokenPayload = { userData: { _id: user._id, email: user.email } };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: 60 * 60 * 24 * 30
      });

      const response = {
        status: "success",
        token: token,
        userData: user
      };

      return res.json(response);
    } else {
      const response = {
        status: "error",
        error: "Invalid Credentials"
      };
      return res.status(401).json(response);
    }
  } catch (error) {
    console.log(error);
  }
});

//REGISTER — DEC-REF-97 D-2 (#72): el registro PÚBLICO queda cerrado (mitiga
// RISK-SEC-8, #62). El alta canónica de usuarios es POST /user con grants,
// desde la consola de administración. Este endpoint queda gated a superadmin
// para no romper el contrato de forma del body.
router.post("/register", checkAuth, async (req, res) => {
  try {
    const grants = req.userData.grants || [];
    if (!grants.some(g => g.role === 'superadmin')) {
      return res.status(403).json({ status: "error", error: "forbidden: registro público deshabilitado — el alta de usuarios es por consola de administración (POST /user)" });
    }
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ status: "error", error: "Name, email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ status: "error", error: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ status: "error", error: "Password must be at least 6 characters" });
    }

    const encryptedPassword = bcrypt.hashSync(password, 10);

    const newUser = {
      name: name,
      email: email,
      password: encryptedPassword
    };

    var user = await User.create(newUser);


    const response = {
      status: "success"
    };

    res.status(200).json(response);
  } catch (error) {
    console.log("ERROR - REGISTER ENDPOINT");
    console.log(error);

    const response = {
      status: "error",
      error: error
    };

    console.log(response);

    return res.status(500).json(response);
  }
});

//GET MQTT WEB CREDENTIALS
router.post("/getmqttcredentials", checkAuth, async (req, res) => {
  try {
    const userId = req.userData._id;

    const credentials = await getWebUserMqttCredentials(userId, req);

    const response = {
      status: "success",
      username: credentials.username,
      password: credentials.password
    };

    res.json(response);
    return;
  } catch (error) {
    console.log(error);

    const response = {
      status: "error"
    };

    return res.status(500).json(response);
  }
});

//GET MQTT CREDENTIALS FOR RECONNECTION
router.post(
  "/getmqttcredentialsforreconnection",
  checkAuth,
  async (req, res) => {
    try {
      const userId = req.userData._id;
      const credentials = await getWebUserMqttCredentials(userId, req);

      const response = {
        status: "success",
        username: credentials.username,
        password: credentials.password
      };

      res.json(response);
    } catch (error) {
      console.log(error);
    }
  }
);

//GET /me — identidad + grants frescos del request actual (28.x.1)
router.get("/me", checkAuth, (req, res) => {
  return res.json({
    status: "success",
    data: {
      _id: req.userData._id,
      email: req.userData.email,
      grants: req.userData.grants
    }
  });
});

//****************** CONSOLA DE USUARIOS (DEC-REF-97 D-2, #72) ******************
// Todo superadmin only, grants frescos de DB (authentication.js:22-26), SIN
// fallback — idiom equipmentsheets.js:20-23. El alta canónica con grants vive
// acá; /register queda gated (arriba).

const USER_ROLES = ['superadmin', 'noc', 'manager', 'cellowner'];  // espejo del enum user.js:20

function isSuperadminReq(req) {
  const grants = req.userData?.grants || [];
  return grants.some(g => g.role === 'superadmin');
}

// Validación de forma de grants: role del enum + scope opcional con
// operatorCode/zoneCode/siteCode strings (shape de user.js:23-27).
function validateGrants(grants) {
  if (!Array.isArray(grants)) return 'grants debe ser un array';
  for (const g of grants) {
    if (!g || typeof g !== 'object') return 'grant no-objeto';
    if (!USER_ROLES.includes(g.role)) return `role inválido '${g.role}' (esperado uno de ${USER_ROLES.join('/')})`;
    if (g.scope !== undefined && g.scope !== null) {
      if (typeof g.scope !== 'object' || Array.isArray(g.scope)) return 'scope debe ser un objeto';
      for (const k of Object.keys(g.scope)) {
        if (!['operatorCode', 'zoneCode', 'siteCode'].includes(k)) return `scope con clave desconocida '${k}'`;
        if (typeof g.scope[k] !== 'string') return `scope.${k} debe ser string`;
      }
    }
  }
  return null;
}

//GET USERS — lista sin password.
router.get("/user", checkAuth, async (req, res) => {
  try {
    if (!isSuperadminReq(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const users = await User.find({}, { password: 0 }).lean();
    return res.json({ status: "success", data: users });
  } catch (error) {
    console.log("ERROR GETTING USERS");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

//POST USER — alta con grants. 409 por findOne previo (patrón D-2, BACKLOG-API-2).
router.post("/user", checkAuth, async (req, res) => {
  try {
    if (!isSuperadminReq(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const newUser = req.body.newUser;                           // wrapper con clave nombrada (patrón de la casa)
    if (!newUser || !newUser.name || !newUser.email || !newUser.password) {
      return res.status(400).json({ status: "error", error: "name, email y password son requeridos" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      return res.status(400).json({ status: "error", error: "Invalid email format" });
    }
    if (newUser.password.length < 6) {
      return res.status(400).json({ status: "error", error: "Password must be at least 6 characters" });
    }
    const grants = newUser.grants || [];
    const grantError = validateGrants(grants);
    if (grantError) {
      return res.status(400).json({ status: "error", error: grantError });
    }
    const existing = await User.findOne({ email: newUser.email });
    if (existing) {
      return res.status(409).json({ status: "error", error: `user '${newUser.email}' ya existe` });
    }
    await User.create({
      name: newUser.name,
      email: newUser.email,
      password: bcrypt.hashSync(newUser.password, 10),
      grants,
    });
    return res.json({ status: "success", email: newUser.email });
  } catch (error) {
    console.log("ERROR CREATING USER");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

//PUT GRANTS — reemplazo total validado. La autorización lee grants frescos de
// DB en cada request ⇒ el cambio aplica en el próximo request, sin re-login.
router.put("/user/:userId/grants", checkAuth, async (req, res) => {
  try {
    if (!isSuperadminReq(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    const grants = req.body.grants;
    const grantError = validateGrants(grants);
    if (grantError) {
      return res.status(400).json({ status: "error", error: grantError });
    }
    const result = await User.updateOne({ _id: req.params.userId }, { $set: { grants } });
    const matched = (result.matchedCount != null) ? result.matchedCount : result.n;
    if (matched === 0) {
      return res.status(404).json({ status: "error", error: "user not found" });
    }
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR UPDATING GRANTS");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

//DELETE USER — 400 en self-delete (un superadmin no puede dejar el sistema sin
// admin por un click mal apuntado).
router.delete("/user/:userId", checkAuth, async (req, res) => {
  try {
    if (!isSuperadminReq(req)) {
      return res.status(403).json({ status: "error", error: "forbidden: superadmin only" });
    }
    if (String(req.userData._id) === String(req.params.userId)) {
      return res.status(400).json({ status: "error", error: "no podés borrar tu propio usuario" });
    }
    const result = await User.deleteOne({ _id: req.params.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ status: "error", error: "user not found" });
    }
    return res.json({ status: "success" });
  } catch (error) {
    console.log("ERROR DELETING USER");
    console.log(error);
    return res.status(500).json({ status: "error", error: error.message || error });
  }
});

//**********************
//**** FUNCTIONS *******
//**********************

// mqtt credential types: "user", "device", "superuser"
async function getWebUserMqttCredentials(userId, req) {
  try {
    // DEC-REF-38 — ACL B-narrow α-estricta: subscribe a sdata/notif/actdata por dId
    // del scope, publish solo a actdata por dId; más {userId}/# propio. Reescrito en
    // cada llamada (CREATE y UPDATE) → scope fresco con grants actualizados (DEC-REF-29/32).
    const owned = await resolveScopedDIdsWithOwner(req);
    const subTopics = [userId + "/#"];
    const pubTopics = [userId + "/#"];
    for (const { dId, userId: owner } of owned) {
      subTopics.push(owner + "/" + dId + "/+/sdata");
      subTopics.push(owner + "/" + dId + "/+/notif");
      subTopics.push(owner + "/" + dId + "/+/actdata");
      pubTopics.push(owner + "/" + dId + "/+/actdata");
    }

    var rule = await EmqxAuthRule.find({ type: "user", userId: userId });

    if (rule.length == 0) {
      const plainPassword = makeid(10);
      const newRule = {
        userId: userId,
        username: makeid(10),
        password: hashPassword(plainPassword),
        publish: pubTopics,
        subscribe: subTopics,
        type: "user",
        time: Date.now(),
        updatedTime: Date.now()
      };

      const result = await EmqxAuthRule.create(newRule);

      return {
        username: result.username,
        password: plainPassword
      };
    }

    const newUserName = makeid(10);
    const newPassword = makeid(10);

    const result = await EmqxAuthRule.updateOne(
      { type: "user", userId: userId },
      {
        $set: {
          username: newUserName,
          password: hashPassword(newPassword),
          publish: pubTopics,
          subscribe: subTopics,
          updatedTime: Date.now()
        }
      }
    );

    if (result.n == 1 && result.ok == 1) {
      return {
        username: newUserName,
        password: newPassword
      };
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
}


function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports = router;
