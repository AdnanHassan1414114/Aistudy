import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";

// Registered once, module-wide -- keeps the bundle to a handful of common
// languages instead of pulling in highlight.js's full language pack.
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("sql", sql);

/** Fenced code blocks arrive from react-markdown as <pre><code class="language-x">.
 *  We intercept at the `code` level: a `language-*` className means it's a
 *  block (highlight + <pre> chrome); anything else is inline code and keeps
 *  the original pill styling. */
function CodeRenderer({ className, children }: { className?: string; children?: ReactNode }) {
  const match = /language-(\w+)/.exec(className ?? "");
  const raw = typeof children === "string" ? children.replace(/\n$/, "") : String(children ?? "");

  if (!match) {
    return (
      <code className="rounded bg-[var(--color-accent-soft)] px-1 py-0.5 font-mono text-[13px]">{children}</code>
    );
  }

  const language = match[1];
  const highlighted = hljs.getLanguage(language)
    ? hljs.highlight(raw, { language }).value
    : hljs.highlightAuto(raw).value;

  return (
    <pre className="hljs-block mb-2 overflow-x-auto rounded-lg border border-[var(--color-rule)] bg-[var(--color-ink)] p-3 font-mono text-[13px] leading-relaxed last:mb-0">
      <code className={className} dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-transcript font-body text-[15px] leading-relaxed text-[var(--color-ink)]">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          // react-markdown already wraps block code in <pre>; returning our
          // own <pre> from the code renderer (below) means the default pre
          // wrapper here should just pass its child straight through.
          pre: ({ children }) => (isValidElement(children) ? children : <pre>{children}</pre>),
          code: CodeRenderer,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="text-[var(--color-accent)] underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
