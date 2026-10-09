const service = require('../services/residentes.service');
const ejecutar = operation => async (req, res) => {
    try {
        const data = await operation(req.usuario, req.params.id, req.body || {});
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, data });
    } catch (error) {
        if (!error.status) console.error('Gestión de residentes:', error.message);
        return res.status(error.status || 503).json({ ok: false,
            message: error.status ? error.message : 'No fue posible guardar los datos. No se completó la operación.' });
    }
};
module.exports = { obtenerDetalle: ejecutar(service.detalle), guardarResidente: ejecutar(service.guardar) };
