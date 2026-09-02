//requires 
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const cors = require("cors");
const colors = require("colors");



require('dotenv').config();

//instances
const app = express();

//express config
app.use(morgan("tiny"));
// DEC-REF-98 (#73): el upload de PDF (base64) de /equipmentsheet/extract
// supera el default de 100kb. Parser de 25mb SOLO para esa ruta, antes del
// global (body-parser salta requests ya parseados: el global no lo retoca).
app.use("/api/equipmentsheet/extract", express.json({ limit: "25mb" }));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true
  })
);
app.use(cors());

//express routes
require("./routes/bridges/tasmota.js"); // registers global.startTasmotaBridge
app.use("/api", require("./routes/devices.js"));
app.use("/api", require("./routes/sites.js"));
app.use("/api", require("./routes/zones.js"));
app.use("/api", require("./routes/forensic.js"));
app.use("/api", require("./routes/simulator.js"));
app.use("/api", require("./routes/users.js"));
app.use("/api", require("./routes/templates.js"));
app.use("/api", require("./routes/webhooks.js"));
app.use("/api", require("./routes/emqxapi.js"));
app.use("/api", require("./routes/alarms.js"));
app.use("/api", require("./routes/rules.js"));
app.use("/api", require("./routes/rulepacks.js"));
app.use("/api", require("./routes/dataprovider.js"));
app.use("/api", require("./routes/dashboard_noc.js"));
app.use("/api", require("./routes/equipmentsheets.js"));  // D-4 montaje permanente (Franco, #68). Sin interruptor: exposición directa firmada junto a S3/S4
app.use("/api", require("./routes/operators.js"));  // DEC-REF-97 D-3 (#72) — operator por API; cierra la pata de alta directa en Mongo de BACKLOG-TENANT-11
 
module.exports = app;

//listener
app.listen(process.env.API_PORT, () => {
  console.log("API server listening on port " + process.env.API_PORT);
});


if (process.env.SSLREDIRECT == "true"){

  const app2 = express();

  app2.listen(3002, function(){
    console.log("Listening on port 3002 (for redirect to ssl)");
  });
  
  app2.all('*', function(req, res){
    console.log("NO SSL ACCESS ... REDIRECTING...");
    return res.redirect("https://" + req.headers["host"] + req.url);
  });
}



//Mongo Connection
const mongoUserName = process.env.MONGO_USERNAME;
const mongoPassword = process.env.MONGO_PASSWORD;
const mongoHost = process.env.MONGO_HOST;
const mongoPort = process.env.MONGO_PORT;
const mongoDatabase = process.env.MONGO_DATABASE;

var uri =
  "mongodb://" +
  mongoUserName +
  ":" +
  mongoPassword +
  "@" +
  mongoHost +
  ":" +
  mongoPort +
  "/" +
  mongoDatabase;

  console.log(uri);

const options = {
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  authSource: "admin"
};

mongoose.connect(uri, options).then(
  async () => {
    console.log("\n");
    console.log("*******************************".green);
    console.log("✔ Mongo Successfully Connected!".green);
    console.log("*******************************".green);
    console.log("\n");
    await global.check_mqtt_superuser();
    global.startMqttClient();

  },
  err => {
    console.log("\n");
    console.log("*******************************".red);
    console.log("    Mongo Connection Failed    ".red);
    console.log("*******************************".red);
    console.log("\n");
    console.log(err);
  }
);





