const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middlewares/authentication.js');

import { query as historyQuery } from '../services/historyProvider.js';
import { resolveScopedDIds } from '../middlewares/scope.js';


router.get('/get-last-data', checkAuth, async (req, res) => {

  try {

    const chartTimeAgo = req.query.chartTimeAgo;
    const dId = req.query.dId;
    const variable = req.query.variable;

    const timeAgoMs = Date.now() - (chartTimeAgo * 60 * 1000 );

    // Gate de scope de grants (DEC-REF-34). Puro scope: NO se compone con
    // userId del caller — eso reintroduciría el ownership que ARCH-3 vino
    // a sacar. resolveScopedDIds ya cubre los devices propios en su rama
    // "sin grant útil"; con grants, agrega los del scope.
    const allowed = await resolveScopedDIds(req);
    if (!allowed.includes(dId)) {
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

    const chartTimeAgo = req.query.chartTimeAgo;
    const dId = req.query.dId;
    const variable = req.query.variable;

    const timeAgoMs = Date.now() - (chartTimeAgo * 60 * 1000 );

    // Gate de scope de grants (DEC-REF-34). Mismo patrón que /get-last-data.
    const allowed = await resolveScopedDIds(req);
    if (!allowed.includes(dId)) {
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