import { useFormatCardText } from "@/hooks/use-formatted-text";

/**
 * Renders card text with KaTeX math + markdown formatting, lazily loading the
 * heavy formatter chunk (KaTeX + marked + DOMPurify ~324 kB) only when needed.
 * While loading, shows the raw text without formatting.
 */
export function FormattedCardText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const html = useFormatCardText(text);
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
