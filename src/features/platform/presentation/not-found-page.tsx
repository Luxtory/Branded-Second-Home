import { messages } from './i18n/pt-br';

export function NotFoundPage() {
  const text = messages.notFound;
  return (
    <main id="conteudo" className="lx-container">
      <div className="lx-empty">
        <p className="lx-marker">
          <span>{text.marker}</span>
        </p>
        <h1 className="lx-display-s">{text.title}</h1>
        <p className="lx-body">{text.body}</p>
      </div>
    </main>
  );
}
