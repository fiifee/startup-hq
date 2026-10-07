import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type HastNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

/** Number checklist boxes in document order, so a click maps back to the right line. */
function rehypeNumberCheckboxes() {
  return (tree: HastNode) => {
    let i = 0;
    const walk = (n: HastNode) => {
      if (n.type === "element" && n.tagName === "input" && n.properties?.type === "checkbox") n.properties.dataIndex = i++;
      n.children?.forEach(walk);
    };
    walk(tree);
  };
}

/**
 * Markdown with GitHub extras. Pass `onToggle` (from a client component) to make
 * checklist boxes clickable; it receives the item's 0-based index in the text.
 */
export function Markdown({ children, className = "", onToggle }: { children: string; className?: string; onToggle?: (index: number) => void }) {
  return (
    <div className={`prose-hq ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeNumberCheckboxes]}
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          input: ({ type, checked, ...rest }) => {
            if (type !== "checkbox") return <input type={type} />;
            const index = Number((rest as Record<string, unknown>)["data-index"]);
            return (
              <input
                type="checkbox"
                checked={!!checked}
                disabled={!onToggle}
                onChange={() => onToggle?.(index)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 align-[-2px] accent-[var(--accent)] cursor-pointer disabled:cursor-default"
              />
            );
          },
          li: ({ children, className: cls }) => (
            <li className={cls?.includes("task-list-item") ? "list-none -ml-5 flex items-start gap-2 [&>input]:mt-1" : undefined}>{children}</li>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
