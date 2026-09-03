import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  source: string;
  className?: string;
};

export function MarkdownView({ source, className }: Props) {
  return (
    <div className={className ? `md ${className}` : "md"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source || "_Empty_"}</ReactMarkdown>
    </div>
  );
}
