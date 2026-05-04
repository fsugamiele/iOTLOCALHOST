const express = require("express");
const router = express.Router();
const { checkAuth } = require("../middlewares/authentication.js");

import Site          from "../models/site.js";
import ForensicEvent from "../models/forensic_event.js";

// GET /api/forensic-events?siteCode=...
// Returns all events for a site, newest first
router.get("/forensic-events", checkAuth, async (req, res) => {
  try {
    const userId   = req.userData._id;
    const { siteCode } = req.query;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }

    const site = await Site.findOne({ userId, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    const events = await ForensicEvent
      .find({ siteId: siteCode })
      .sort({ timestamp: -1 })
      .lean();

    return res.json({ status: "success", data: events });
  } catch (error) {
    console.log("ERROR GETTING FORENSIC EVENTS");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

// GET /api/forensic-events/verify?siteCode=...
// Verifies chain integrity for a site
router.get("/forensic-events/verify", checkAuth, async (req, res) => {
  try {
    const userId       = req.userData._id;
    const { siteCode } = req.query;

    if (!siteCode) {
      return res.status(400).json({ status: "error", error: "siteCode is required" });
    }

    const site = await Site.findOne({ userId, siteCode });
    if (!site) {
      return res.status(404).json({ status: "error", error: "site not found" });
    }

    const events = await ForensicEvent
      .find({ siteId: siteCode })
      .sort({ timestamp: 1 })
      .lean();

    const result = ForensicEvent.verifyChain(events);

    return res.json({ status: "success", data: { ...result, totalEvents: events.length } });
  } catch (error) {
    console.log("ERROR VERIFYING FORENSIC CHAIN");
    console.log(error);
    return res.status(500).json({ status: "error", error });
  }
});

module.exports = router;
