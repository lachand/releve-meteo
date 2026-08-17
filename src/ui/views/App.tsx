export function App() {
  return (
    <main style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px' }}>
      <p className="eyebrow">Relevé</p>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--pas-xl)', margin: '8px 0' }}>
        En construction
      </h1>
      <p style={{ color: 'var(--encre-faible)' }}>
        Le socle technique est en place. La prévision, la cascade de modèles et la confiance
        arrivent aux lots suivants.
      </p>
      <p>
        <a href="/sources.html" style={{ color: 'var(--encre)' }}>
          Sources et licences
        </a>
      </p>
    </main>
  );
}
