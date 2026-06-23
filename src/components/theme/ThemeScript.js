export default function ThemeScript() {
  const script = `
    (function () {
      try {
        var key = 'scrappy-theme';
        var stored = localStorage.getItem(key);
        var theme = stored === 'light' || stored === 'dark'
          ? stored
          : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
