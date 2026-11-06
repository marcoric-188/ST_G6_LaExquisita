/*
 * Aviso de arranque (script clásico, sin módulos).
 * Si alguien abre index.html con doble clic (file://), el navegador bloquea los
 * módulos JS y las cookies de sesión. Mostramos cómo abrirlo correctamente.
 */
(function () {
    if (location.protocol !== 'file:') return;
    document.addEventListener('DOMContentLoaded', function () {
        document.body.innerHTML =
            '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:32px;border-radius:20px;background:#fffbf3;border:1px solid #eadcc0;color:#2b1b11;box-shadow:0 12px 32px rgba(43,27,17,.12)">' +
            '<h2 style="margin-top:0">🌽 Abre La Exquisita desde el servidor</h2>' +
            '<p>Este sistema ahora lo entrega el backend. Sigue estos pasos:</p>' +
            '<ol><li>En una terminal: <code>cd backend</code> y luego <code>npm start</code></li>' +
            '<li>Abre <a href="http://localhost:3000">http://localhost:3000</a> en el navegador.</li></ol>' +
            '<p style="color:#6f5847">Abrir el archivo con doble clic no permite iniciar sesión ni conectar con SQL Server.</p></div>';
    });
})();
