const express = require('express');
const router = express.Router();
const { checkAuth } = require('../middlewares/authentication.js');
const { buildReadFilter, buildWriteFilter } = require('../middlewares/scope.js');
const RulePack = require('../models/rule_pack.js');
const { collectCrossLeafRefs } = require('../services/ruleValidation.js');

//models import
import Template from '../models/template.js';
import Device from '../models/device.js';
import EquipmentSheet from '../models/equipment_sheet.js';

//get templates
router.get('/template', checkAuth, async (req, res) => {

    try {

        const filter = await buildReadFilter(req, 'Template');
        const templates = await Template.find(filter);

        console.log(templates)

        const response = {
            status: "success",
            data: templates
        }

        return res.json(response);

    } catch (error) {

        console.log(error);

        const response = {
            status: "error",
            error: error
        }

        return res.status(500).json(response);

    }

});

//create template
router.post('/template', checkAuth, async (req, res) => {

    try {

        const userId = req.userData._id;

        var newTemplate = req.body.template;

        if (!newTemplate || !newTemplate.name) {
            return res.status(400).json({ status: "error", error: "Template name is required" });
        }

        if (!newTemplate.widgets || !Array.isArray(newTemplate.widgets) || newTemplate.widgets.length === 0) {
            return res.status(400).json({ status: "error", error: "Template must have at least one widget" });
        }

        // S3 (decisión Franco): si la plantilla referencia una ficha, la
        // referencia debe ser válida — se rechaza texto libre desde el
        // nacimiento del campo. '' sigue permitido (compat pre-ficha).
        if (newTemplate.deviceType) {
            if (typeof newTemplate.deviceType !== 'string') {
                return res.status(400).json({ status: "error", error: "deviceType must be a string" });
            }
            const sheet = await EquipmentSheet.findOne({ deviceType: newTemplate.deviceType });
            if (!sheet) {
                return res.status(400).json({ status: "error", error: "deviceType does not reference an existing equipment sheet" });
            }
        }

        newTemplate.userId = userId;
        newTemplate.createdTime = Date.now();

        const r = await Template.create(newTemplate);

        const response = {
            status: "success",
        }

        return res.json(response)

    } catch (error) {

        console.log(error);

        const response = {
            status: "error",
            error: error
        }

        return res.status(500).json(response);

    }

});

//update template — DEC-REF-100 D-6 (#75, F4)
// Las plantillas son editables, con guardas: si la edición QUITA variables que
// usan dispositivos asociados o reglas del pack del deviceType, se rechaza
// (409) con el detalle — un widget huérfano en Panel o una regla muda son
// fallas silentes, y fail-closed acá las evita.
router.put('/template', checkAuth, async (req, res) => {

    try {

        const { templateId, template } = req.body || {};

        if (!templateId) {
            return res.status(400).json({ status: "error", error: "templateId is required" });
        }

        if (!template || !template.name) {
            return res.status(400).json({ status: "error", error: "Template name is required" });
        }

        if (!template.widgets || !Array.isArray(template.widgets) || template.widgets.length === 0) {
            return res.status(400).json({ status: "error", error: "Template must have at least one widget" });
        }

        // Espejo del POST: la referencia a la ficha debe ser válida si viene.
        if (template.deviceType) {
            if (typeof template.deviceType !== 'string') {
                return res.status(400).json({ status: "error", error: "deviceType must be a string" });
            }
            const sheet = await EquipmentSheet.findOne({ deviceType: template.deviceType });
            if (!sheet) {
                return res.status(400).json({ status: "error", error: "deviceType does not reference an existing equipment sheet" });
            }
        }

        const filter = await buildWriteFilter(req, 'Template');
        const current = await Template.findOne({ ...filter, _id: templateId });

        if (!current) {
            return res.status(404).json({ status: "error", error: "template not found" });
        }

        // Variables que la edición dejaría sin widget en la plantilla.
        const oldVars = new Set((current.widgets || []).map(w => w.variable).filter(Boolean));
        const newVars = new Set(template.widgets.map(w => w.variable).filter(Boolean));
        const removedVars = [...oldVars].filter(v => !newVars.has(v));

        if (removedVars.length > 0) {

            // Guarda 1: devices asociados a la plantilla dependen de esas variables.
            const deviceCount = await Device.countDocuments({ templateId: templateId });
            if (deviceCount > 0) {
                return res.status(409).json({
                    status: "error",
                    error: `No se pueden quitar variables (${removedVars.join(', ')}): hay ${deviceCount} dispositivo(s) asociados a esta plantilla. Quitá primero los dispositivos o conservá las variables.`
                });
            }

            // Guarda 2: reglas del pack del deviceType que referencian esas variables
            // (D/C/S directas + hojas de crossExpr) quedarían sin fuente de datos.
            if (current.deviceType) {
                const dt = current.deviceType;
                const packs = await RulePack.find({ deviceType: dt });
                const blocked = [];

                for (const pack of packs) {
                    for (const r of pack.rules || []) {
                        if (r.deviceType === dt && removedVars.includes(r.variable)) {
                            blocked.push(`${r.ruleId} (pack ${pack.packId})`);
                        }
                    }
                    for (const ref of collectCrossLeafRefs(pack)) {
                        if (ref.deviceType === dt && removedVars.includes(ref.variable)) {
                            blocked.push(`${ref.ruleId} hoja cross (pack ${pack.packId})`);
                        }
                    }
                }

                if (blocked.length > 0) {
                    return res.status(409).json({
                        status: "error",
                        error: `No se pueden quitar variables (${removedVars.join(', ')}): las usan estas reglas: ${blocked.join(', ')}. Editá primero las reglas o conservá las variables.`
                    });
                }
            }
        }

        current.name = template.name;
        current.description = template.description || '';
        current.deviceType = template.deviceType || '';
        current.widgets = template.widgets;
        // userId y createdTime se preservan: una edición no cambia la tenencia
        // ni la fecha de nacimiento de la plantilla.

        await current.save();

        return res.json({ status: "success" });

    } catch (error) {

        console.log(error);

        const response = {
            status: "error",
            error: error
        }

        return res.status(500).json(response);

    }

});

//delete template
router.delete('/template', checkAuth, async (req, res) => {

    try {

        const userId = req.userData._id;
        const templateId = req.query.templateId;

        const devices = await Device.find({userId: userId, templateId: templateId });


        if (devices.length > 0){

            const response = {
                status: "fail",
                error: "template in use"
            }
    
            return res.json(response);
        }

        const r = await Template.deleteOne({userId: userId, _id: templateId});

        const response = {
            status: "success",
        }

        return res.json(response)

    } catch (error) {

        console.log(error);

        const response = {
            status: "error",
            error: error
        }

        return res.status(500).json(response);

    }

});

module.exports = router;