/**
 * Mounts each demo matching `selector` once, when it first comes near the viewport, and reports load
 * failures in its `[data-status]` element.
 */
export function mountWhenVisible(selector: string, mount: (root: HTMLElement) => Promise<void> | void) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const root = entry.target as HTMLElement;
        Promise.resolve()
          .then(() => mount(root))
          .catch((error) => {
            const status = root.querySelector('[data-status]');
            if (status) status.textContent = 'The demo failed to load.';
            console.error(error);
          });
      }
    },
    { rootMargin: '200px' },
  );
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => observer.observe(el));
}
