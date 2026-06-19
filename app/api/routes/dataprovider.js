const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middlewares/authentication.js');

//models import
import Data from '../models/data.js';
import { query as historyQuery } from '../services/historyProvider.js';

// Gate temporal (andamiaje 30.2) — preserva la invisibilidad de hoy
// (dId/variable ajeno → success + []). Chequea presencia de DATOS, no
// ownership del device (preserva el flujo del huérfano: dueño con Data
// sobreviviente a Device borrado sigue viendo sus muestras). En 30.3
// esto se reemplaza por resolveScopedDIds — REINTRODUCE el caso huérfano
// (porque deriva de Device), decisión a tomar explícitamente ahí.
async function hasDataGate(userId, dId, variable) {
  const hit = await Data.findOne({ userId, dId, variable }, { _id: 1 }).lean();
  return !!hit;
}


router.get('/get-last-data', checkAuth, async (req, res) => {

  try {

    const userId = req.userData._id;
    const chartTimeAgo = req.query.chartTimeAgo;
    const dId = req.query.dId;
    const variable = req.query.variable;

    const timeAgoMs = Date.now() - (chartTimeAgo * 60 * 1000 );

    if (!(await hasDataGate(userId, dId, variable))) {
      return res.json({ status: "success", data: [] });
    }

    const data = await historyQuery({ dId, variable, sinceMs: timeAgoMs });


    const response = {
      status: "success",
      data: data
    }

    return res.json(response)

  } catch (error) {

    console.log(error)

    const response = {
      status: "error",
      error: error
    } 

    return res.json(response);

  }

});


router.get('/get-small-charts-data', checkAuth, async (req, res) => {

  try {

    const userId = req.userData._id;
    const chartTimeAgo = req.query.chartTimeAgo;
    const dId = req.query.dId;
    const variable = req.query.variable;

    const timeAgoMs = Date.now() - (chartTimeAgo * 60 * 1000 );

    if (!(await hasDataGate(userId, dId, variable))) {
      return res.json({ status: "success", data: [] });
    }

    const data = await historyQuery({ dId, variable, sinceMs: timeAgoMs });


    const response = {
      status: "success",
      data: data
    }

    return res.json(response)

  } catch (error) {

    console.log(error)

    const response = {
      status: "error",
      error: error
    } 

    return res.json(response);

  }

});

module.exports = router