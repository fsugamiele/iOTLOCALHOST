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

//REGISTER
router.post("/register", async (req, res) => {
  try {
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
