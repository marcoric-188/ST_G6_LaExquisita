(() => {
    const API_URL = 'http://localhost:3000/api/chatbot';
    const history = [];

    const style = document.createElement('style');
    style.textContent = `
      .le-chat-launcher{position:fixed;right:24px;bottom:24px;z-index:9998;border:0;border-radius:999px;padding:14px 19px;background:#173f3a;color:#fff;font:600 14px Arial,sans-serif;box-shadow:0 8px 28px #0003;cursor:pointer}
      .le-chat-panel{position:fixed;right:24px;bottom:86px;width:min(380px,calc(100vw - 28px));height:min(560px,calc(100vh - 120px));z-index:9999;background:#fff;border:1px solid #dce5e2;border-radius:18px;box-shadow:0 18px 55px #0003;display:none;overflow:hidden;font-family:Arial,sans-serif;color:#182321}
      .le-chat-panel.open{display:flex;flex-direction:column}
      .le-chat-head{background:#173f3a;color:#fff;padding:16px;display:flex;align-items:center;justify-content:space-between}
      .le-chat-head strong{display:block;font-size:15px}.le-chat-head small{opacity:.8;font-size:11px}
      .le-chat-close{background:transparent;border:0;color:#fff;font-size:23px;cursor:pointer}
      .le-chat-messages{flex:1;overflow:auto;padding:14px;background:#f6f8f7}
      .le-chat-msg{max-width:88%;padding:10px 12px;margin:0 0 10px;border-radius:13px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
      .le-chat-msg.bot{background:#fff;border:1px solid #e2e9e6;border-top-left-radius:4px}
      .le-chat-msg.user{background:#dcece7;margin-left:auto;border-top-right-radius:4px}
      .le-chat-status{font-size:11px;color:#687773;padding:0 14px 8px;background:#f6f8f7}
      .le-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5ebe8;background:#fff}
      .le-chat-input{min-width:0;flex:1;border:1px solid #ccd8d3;border-radius:10px;padding:11px;font-size:13px;outline:none}
      .le-chat-input:focus{border-color:#377c6e}
      .le-chat-send{border:0;border-radius:10px;background:#173f3a;color:#fff;padding:0 15px;font-weight:600;cursor:pointer}
      .le-chat-send:disabled{opacity:.55;cursor:wait}
      @media(max-width:480px){.le-chat-launcher{right:14px;bottom:14px}.le-chat-panel{right:10px;bottom:76px;width:calc(100vw - 20px);height:70vh}}
    `;
    document.head.appendChild(style);

    const launcher = document.createElement('button');
    launcher.className = 'le-chat-launcher';
    launcher.type = 'button';
    launcher.textContent = '✦ Asistente IA';

    const panel = document.createElement('section');
    panel.className = 'le-chat-panel';
    panel.setAttribute('aria-label', 'Asistente de La Exquisita');
    panel.innerHTML = `
      <header class="le-chat-head">
        <div><strong>Asistente IA · La Exquisita</strong><small>Consultas de ventas e inventario</small></div>
        <button class="le-chat-close" type="button" aria-label="Cerrar">×</button>
      </header>
      <div class="le-chat-messages" aria-live="polite">
        <div class="le-chat-msg bot">¡Hola! Puedo ayudarte a consultar el inventario y resumir las ventas registradas. ¿Qué necesitas revisar?</div>
      </div>
      <div class="le-chat-status">Las respuestas se basan en los datos disponibles en la base de datos.</div>
      <form class="le-chat-form">
        <input class="le-chat-input" maxlength="1500" placeholder="Escribe tu pregunta..." autocomplete="off" required>
        <button class="le-chat-send" type="submit">Enviar</button>
      </form>
    `;

    document.body.append(launcher, panel);

    const messages = panel.querySelector('.le-chat-messages');
    const form = panel.querySelector('.le-chat-form');
    const input = panel.querySelector('.le-chat-input');
    const send = panel.querySelector('.le-chat-send');

    function addMessage(text, who) {
        const item = document.createElement('div');
        item.className = `le-chat-msg ${who}`;
        item.textContent = text;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    launcher.addEventListener('click', () => panel.classList.toggle('open'));
    panel.querySelector('.le-chat-close').addEventListener('click', () => panel.classList.remove('open'));

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = input.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        history.push({ role: 'user', content: message });
        input.value = '';
        send.disabled = true;
        send.textContent = '...';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, history: history.slice(-8) })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'No fue posible obtener una respuesta.');
            }

            addMessage(result.answer, 'bot');
            history.push({ role: 'assistant', content: result.answer });
        } catch (error) {
            addMessage(`No pude conectar con el asistente. ${error.message}\nVerifica que el backend esté ejecutándose en el puerto 3000.`, 'bot');
        } finally {
            send.disabled = false;
            send.textContent = 'Enviar';
            input.focus();
        }
    });
})();
