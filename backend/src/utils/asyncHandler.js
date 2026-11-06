/**
 * UTILIDAD TRANSVERSAL · Envuelve controladores async para que cualquier error
 * llegue al manejador central (antes un error sin capturar tumbaba el servidor).
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
