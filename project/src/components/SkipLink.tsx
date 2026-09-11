/**
 * First focusable element on pages that render navigation chrome before their
 * content. Hidden until focused, so it costs nothing visually.
 */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a href={`#${targetId}`} className="skip-link">
      Skip to main content
    </a>
  );
}
