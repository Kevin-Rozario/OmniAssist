const themeScript = `(function(){try{var key='theme';var theme=localStorage.getItem(key)||'system';var resolved=theme;if(theme==='system'){resolved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var root=document.documentElement;root.classList.remove('light','dark');if(resolved==='dark'||resolved==='light'){root.classList.add(resolved);root.style.colorScheme=resolved}}catch(e){}})();`;

/** Blocking script so the first paint matches the stored theme. */
export function ThemeScript() {
  // The script is a static literal so the stored theme is applied before first paint.
  // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
