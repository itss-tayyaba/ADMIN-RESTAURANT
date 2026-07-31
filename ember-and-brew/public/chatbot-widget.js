/* ==========================================================================
   Ember & Brew — Shared Chatbot Widget
   Dropped into every portal (customer / admin / kitchen / delivery). Each
   page sets `window.EB_CHATBOT_CONFIG` *before* this script loads to tell
   the widget which token to send and how to introduce itself, e.g.:

     window.EB_CHATBOT_CONFIG = {
       tokenKey: 'eb_customer_token',
       title: 'Ember Assistant',
       subtitle: 'Ask about the menu or your order',
       greeting: "Hi! Ask me about the menu, prices, or your order status.",
       quickReplies: ['Is the Tiramisu on the menu?', "Where's my order?"]
     };

   The widget talks to POST /api/chatbot/message with whatever bearer token
   is in localStorage under `tokenKey`. If there's no token yet, it politely
   asks the person to log in instead of calling the API.
   ========================================================================== */
(function () {
  const cfg = Object.assign({
    tokenKey: 'eb_customer_token',
    title: 'Ember Assistant',
    subtitle: 'Ask me anything',
    greeting: 'Hi! How can I help?',
    quickReplies: []
  }, window.EB_CHATBOT_CONFIG || {});

  const STYLE = `
  .eb-chat-launcher{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;
    background:linear-gradient(135deg,#C4923A,#9A5638);color:#fff;border:none;cursor:pointer;
    box-shadow:0 10px 30px rgba(26,25,23,.28);z-index:9999;display:flex;align-items:center;justify-content:center;
    font-size:24px;transition:transform .18s ease;}
  .eb-chat-launcher:hover{transform:scale(1.06);}
  .eb-chat-launcher svg{display:block;}
  .eb-chat-launcher .eb-dot{position:absolute;top:6px;right:6px;width:10px;height:10px;border-radius:50%;background:#657558;border:2px solid #fff;}
  .eb-chat-panel{position:fixed;bottom:94px;right:24px;width:360px;max-width:92vw;height:500px;max-height:76vh;
    background:#F5F0E8;border:1px solid #E3D9C6;border-radius:20px;box-shadow:0 24px 60px rgba(26,25,23,.32);
    display:flex;flex-direction:column;overflow:hidden;z-index:9999;font-family:'DM Sans',system-ui,sans-serif;
    opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .16s ease,transform .16s ease;}
  .eb-chat-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
  .eb-chat-head{background:#1A1917;color:#F5F0E8;padding:16px 18px;display:flex;align-items:center;gap:10px;flex-shrink:0;}
  .eb-chat-head .eb-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#C4923A,#9A5638);
    display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}
  .eb-chat-head .eb-titles{flex:1;min-width:0;}
  .eb-chat-head .eb-titles .t{font-weight:700;font-size:14.5px;font-family:'Playfair Display',serif;}
  .eb-chat-head .eb-titles .s{font-size:11.5px;opacity:.65;}
  .eb-chat-close{background:rgba(255,255,255,.1);border:none;color:#F5F0E8;width:26px;height:26px;border-radius:50%;
    cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .eb-chat-close:hover{background:rgba(255,255,255,.2);}
  .eb-chat-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F5F0E8;}
  .eb-msg{max-width:84%;padding:10px 13px;border-radius:14px;font-size:13.3px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}
  .eb-msg.bot{align-self:flex-start;background:#FFFFFF;border:1px solid #E3D9C6;color:#242220;border-bottom-left-radius:4px;}
  .eb-msg.user{align-self:flex-end;background:#C4923A;color:#fff;border-bottom-right-radius:4px;}
  .eb-msg.typing{align-self:flex-start;background:#FFFFFF;border:1px solid #E3D9C6;color:#8A8478;font-style:italic;}
  .eb-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px;flex-shrink:0;}
  .eb-chip{background:#FFFFFF;border:1px solid #E3D9C6;color:#3D3830;font-size:11.5px;padding:6px 10px;
    border-radius:999px;cursor:pointer;transition:all .15s;}
  .eb-chip:hover{background:#F1DFB8;border-color:#C4923A;}
  .eb-chat-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #E3D9C6;background:#FFFFFF;flex-shrink:0;}
  .eb-chat-input-row input{flex:1;border:1px solid #E3D9C6;border-radius:12px;padding:10px 12px;font-size:13px;
    outline:none;background:#FDF8EF;color:#242220;}
  .eb-chat-input-row input:focus{border-color:#C4923A;}
  .eb-chat-send{background:#1A1917;color:#F5F0E8;border:none;width:38px;height:38px;border-radius:10px;
    cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
  .eb-chat-send:hover{background:#3D3830;}
  .eb-chat-send:disabled{opacity:.5;cursor:not-allowed;}
  @media (max-width:480px){.eb-chat-panel{right:12px;bottom:84px;width:calc(100vw - 24px);}
    .eb-chat-launcher{right:16px;bottom:16px;}}
  `;

  function injectStyle() {
    if (document.getElementById('eb-chat-style')) return;
    const s = document.createElement('style');
    s.id = 'eb-chat-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function build() {
    injectStyle();

    // Clean line-art icons (currentColor) — swapped in for the old 💬 emoji
    // and text-avatar so the widget reads as a designed product, not a demo.
    const ICON_LAUNCHER = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 12.5C4 7.80558 7.85786 4 12.6 4C17.3421 4 21.2 7.80558 21.2 12.5C21.2 17.1944 17.3421 21 12.6 21C11.1097 21 9.70605 20.6197 8.48 19.95L4 21L5.32 17.24C4.49 16.05 4 14.63 4 13.1V12.5Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="9.3" cy="12.5" r="1.05" fill="currentColor"/><circle cx="12.6" cy="12.5" r="1.05" fill="currentColor"/><circle cx="15.9" cy="12.5" r="1.05" fill="currentColor"/></svg>';
    const ICON_AVATAR = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 12.5C4 7.80558 7.85786 4 12.6 4C17.3421 4 21.2 7.80558 21.2 12.5C21.2 17.1944 17.3421 21 12.6 21C11.1097 21 9.70605 20.6197 8.48 19.95L4 21L5.32 17.24C4.49 16.05 4 14.63 4 13.1V12.5Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="9.3" cy="12.5" r="1" fill="currentColor"/><circle cx="12.6" cy="12.5" r="1" fill="currentColor"/><circle cx="15.9" cy="12.5" r="1" fill="currentColor"/></svg>';
    const ICON_CLOSE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    const ICON_SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M21 3L3 10.5L10.8 13.2M21 3L13.5 21L10.8 13.2M21 3L10.8 13.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const launcher = document.createElement('button');
    launcher.className = 'eb-chat-launcher';
    launcher.setAttribute('aria-label', 'Open chat assistant');
    launcher.innerHTML = ICON_LAUNCHER + '<span class="eb-dot"></span>';

    const panel = document.createElement('div');
    panel.className = 'eb-chat-panel';
    panel.innerHTML = `
      <div class="eb-chat-head">
        <div class="eb-avatar">${ICON_AVATAR}</div>
        <div class="eb-titles">
          <div class="t">${cfg.title}</div>
          <div class="s">${cfg.subtitle}</div>
        </div>
        <button class="eb-chat-close" aria-label="Close chat">${ICON_CLOSE}</button>
      </div>
      <div class="eb-chat-body" id="eb-chat-body"></div>
      <div class="eb-chips" id="eb-chat-chips"></div>
      <div class="eb-chat-input-row">
        <input type="text" id="eb-chat-input" placeholder="Type a message…" autocomplete="off" />
        <button class="eb-chat-send" id="eb-chat-send">${ICON_SEND}</button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const body = panel.querySelector('#eb-chat-body');
    const chipsWrap = panel.querySelector('#eb-chat-chips');
    const input = panel.querySelector('#eb-chat-input');
    const sendBtn = panel.querySelector('#eb-chat-send');
    const closeBtn = panel.querySelector('.eb-chat-close');

    let opened = false;
    const history = []; // {role:'user'|'assistant', content:string} — last few turns, for follow-up questions

    function addMsg(text, who) {
      const div = document.createElement('div');
      div.className = 'eb-msg ' + who;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      return div;
    }

    function renderChips() {
      chipsWrap.innerHTML = '';
      (cfg.quickReplies || []).forEach(q => {
        const c = document.createElement('button');
        c.className = 'eb-chip';
        c.textContent = q;
        c.onclick = () => { input.value = q; sendMessage(); };
        chipsWrap.appendChild(c);
      });
    }

    async function sendMessage() {
      const token = localStorage.getItem(cfg.tokenKey);
      const text = input.value.trim();
      if (!text) return;
      addMsg(text, 'user');
      input.value = '';
      sendBtn.disabled = true;

      if (!token) {
        addMsg('Please log in first — then I can help with that.', 'bot');
        sendBtn.disabled = false;
        return;
      }

      const typingEl = addMsg('typing…', 'typing');
      try {
        const res = await fetch('/api/chatbot/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ message: text, history })
        });
        const data = await res.json().catch(() => ({}));
        typingEl.remove();
        const replyText = data.reply || "Sorry, I didn't catch that.";
        addMsg(replyText, 'bot');
        history.push({ role: 'user', content: text }, { role: 'assistant', content: replyText });
        if (history.length > 8) history.splice(0, history.length - 8);
      } catch (err) {
        typingEl.remove();
        addMsg("I'm having trouble connecting right now. Please try again.", 'bot');
      }
      sendBtn.disabled = false;
      input.focus();
    }

    launcher.addEventListener('click', () => {
      opened = !opened;
      panel.classList.toggle('open', opened);
      if (opened && !body.dataset.greeted) {
        addMsg(cfg.greeting, 'bot');
        renderChips();
        body.dataset.greeted = '1';
      }
      if (opened) setTimeout(() => input.focus(), 200);
    });
    closeBtn.addEventListener('click', () => { opened = false; panel.classList.remove('open'); });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
