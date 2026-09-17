import { useEffect, useRef, useState } from 'react';
import { canvasPoint, ChromiumSession } from '../lib/chromiumSession.mjs';
import { StatusMessage } from '../components/StatusMessage.jsx';

export const CHROMIUM_QUICK_LINKS = Object.freeze([
  { href: 'https://www.google.com/', label: 'Google' },
  { href: 'https://github.com/', label: 'GitHub' },
  { href: 'https://developer.mozilla.org/', label: 'MDN' },
]);

export function ChromiumPage() {
  const [address, setAddress] = useState('');
  const [view, setView] = useState('home');
  const [status, setStatus] = useState({ message: 'Chromium 已就緒。', tone: '' });
  const canvasRef = useRef(null);
  const panelRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    const session = new ChromiumSession(canvasRef.current, {
      onState: ({ state, message }) => {
        if (state === 'opening') {
          setStatus({ message, tone: '' });
          return;
        }
        if (state === 'ready') {
          setStatus({ message, tone: 'success' });
          return;
        }
        if (state === 'error' || state === 'closed') setStatus({ message, tone: 'error' });
      },
    });
    sessionRef.current = session;
    return () => {
      session.destroy();
      sessionRef.current = null;
    };
  }, []);

  const openUrl = async raw => {
    setView('session');
    const width = Math.min(1280, Math.max(640, panelRef.current?.clientWidth || 1280));
    try {
      const url = await sessionRef.current.open(raw, { size: { width, height: 720 } });
      setAddress(url);
    } catch (error) {
      setStatus({ message: error.message, tone: 'error' });
    }
  };

  const closeSession = () => {
    sessionRef.current?.destroy();
    setView('home');
    setStatus({ message: 'Chromium 已就緒。', tone: '' });
  };

  const submit = event => {
    event.preventDefault();
    openUrl(address);
  };

  const sendInput = input => sessionRef.current?.send({ type: 'input', input });

  const mouseButton = button => (button === 2 ? 'right' : button === 1 ? 'middle' : 'left');

  return (
    <main className="main-content chromium-page">
      <div className="page-heading">
        <div>
          <h1>Chromium</h1>
          <p>在伺服器端 Chrome 瀏覽器內瀏覽網站。</p>
        </div>
        <button
          id="chromiumHomeButton"
          className="btn btn-outline"
          type="button"
          title="結束瀏覽工作階段"
          hidden={view === 'home'}
          onClick={closeSession}
        >
          結束
        </button>
      </div>

      <form id="chromiumAddressForm" className="chromium-address-bar" noValidate onSubmit={submit}>
        <label className="sr-only" htmlFor="chromiumAddress">網址</label>
        <input
          id="chromiumAddress"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="輸入網址，例如 https://example.com"
          required
          value={address}
          onChange={event => setAddress(event.target.value)}
        />
        <button className="btn btn-primary" type="submit">前往</button>
      </form>

      <StatusMessage id="chromiumStatus" message={status.message} tone={status.tone} />

      <section id="chromiumHome" className="chromium-home" aria-labelledby="chromiumHomeHeading" hidden={view !== 'home'}>
        <h2 id="chromiumHomeHeading">開始瀏覽</h2>
        <p>輸入網址後，系統會建立你的伺服器端 Chromium 工作階段。</p>
        <div className="chromium-quick-links" aria-label="快速連結">
          {CHROMIUM_QUICK_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              data-chromium-url={link.href}
              onClick={event => {
                event.preventDefault();
                openUrl(link.href);
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>

      <section
        id="chromiumFramePanel"
        className="chromium-panel"
        aria-labelledby="chromiumFrameHeading"
        hidden={view === 'home'}
        ref={panelRef}
      >
        <div className="chromium-panel-heading">
          <h2 id="chromiumFrameHeading">瀏覽工作區</h2>
          <span id="chromiumConnectionName" className="table-subtext">CDP Screencast</span>
        </div>
        <canvas
          id="chromiumFrame"
          className="chromium-frame"
          role="application"
          aria-label="Chromium 工作區"
          tabIndex={0}
          ref={canvasRef}
          onContextMenu={event => event.preventDefault()}
          onMouseDown={event => {
            event.preventDefault();
            event.currentTarget.focus();
            sendInput({
              type: 'mouse',
              eventType: 'mousePressed',
              ...canvasPoint(event.currentTarget, event),
              button: mouseButton(event.button),
              clickCount: event.detail || 1,
            });
          }}
          onMouseUp={event => {
            event.preventDefault();
            sendInput({
              type: 'mouse',
              eventType: 'mouseReleased',
              ...canvasPoint(event.currentTarget, event),
              button: mouseButton(event.button),
            });
          }}
          onMouseMove={event => {
            if (event.buttons === 0) return;
            sendInput({
              type: 'mouse',
              eventType: 'mouseMoved',
              ...canvasPoint(event.currentTarget, event),
              button: 'none',
            });
          }}
          onWheel={event => {
            event.preventDefault();
            sendInput({
              type: 'wheel',
              ...canvasPoint(event.currentTarget, event),
              deltaX: event.deltaX,
              deltaY: event.deltaY,
            });
          }}
          onKeyDown={event => {
            event.preventDefault();
            sendInput({
              type: 'key',
              eventType: 'keyDown',
              key: event.key,
              code: event.code,
              text: event.key.length === 1 ? event.key : undefined,
              windowsVirtualKeyCode: event.keyCode,
            });
          }}
          onKeyUp={event => {
            event.preventDefault();
            sendInput({
              type: 'key',
              eventType: 'keyUp',
              key: event.key,
              code: event.code,
              windowsVirtualKeyCode: event.keyCode,
            });
          }}
        />
      </section>
    </main>
  );
}
