import type { ReactNode } from "react";

function Inline({ value }: { value: string }) {
  const parts = value.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(part);
        if (link) {
          return <a key={index} className="link" href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={index} className="rounded bg-action-tint/60 px-1 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        return part;
      })}
    </>
  );
}

function Table({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((line) => !/^\|?\s*:?-{3,}/.test(line.trim()))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const [head, ...body] = rows;
  if (!head) return null;
  return (
    <div className="my-5 overflow-x-auto border border-line">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-surface">
          <tr>{head.map((cell, index) => <th key={index} className="border-b border-line px-3 py-2 font-medium"><Inline value={cell} /></th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top even:bg-surface/60">
              {head.map((_, cellIndex) => <td key={cellIndex} className="border-t border-line px-3 py-2 leading-6"><Inline value={row[cellIndex] ?? ""} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small, dependency-free renderer for the bundled specification Markdown. */
export function SpecRenderer({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: Array<{ ordered: boolean; text: string }> = [];
  let table: string[] = [];
  let code: string[] | null = null;
  let language = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`} className="my-4 leading-7 text-muted"><Inline value={paragraph.join(" ")} /></p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const ordered = list[0].ordered;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={`my-4 space-y-2 pl-5 leading-7 text-muted ${ordered ? "list-decimal" : "list-disc"}`}>
        {list.map((item, index) => <li key={index}><Inline value={item.text} /></li>)}
      </Tag>
    );
    list = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    blocks.push(<Table key={`t-${blocks.length}`} lines={table} />);
    table = [];
  };
  const flushBlocks = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushBlocks();
      if (code === null) {
        code = [];
        language = line.slice(3).trim();
      } else {
        blocks.push(
          <pre key={`c-${blocks.length}`} className="my-5 overflow-x-auto rounded-md border border-line bg-surface p-4 text-xs leading-5 text-foreground">
            <code data-language={language || undefined}>{code.join("\n")}</code>
          </pre>
        );
        code = null;
        language = "";
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      const content = <Inline value={heading[2]} />;
      if (level === 1) blocks.push(<h2 key={`h-${blocks.length}`} className="display-m mt-12 first:mt-0">{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={`h-${blocks.length}`} className="mt-12 border-t border-line pt-8 text-xl font-medium tracking-tight">{content}</h3>);
      else blocks.push(<h4 key={`h-${blocks.length}`} className="mt-8 text-base font-medium">{content}</h4>);
      continue;
    }
    if (line.trim() === "") {
      flushBlocks();
      continue;
    }
    if (line.trim().startsWith("|")) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }
    if (table.length) flushTable();
    const item = /^\s*(?:([-*])|(\d+)\.)\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push({ ordered: Boolean(item[2]), text: item[3] });
      continue;
    }
    if (list.length) flushList();
    paragraph.push(line.trim().replace(/ {2}$/, ""));
  }
  if (code !== null) {
    blocks.push(<pre key={`c-${blocks.length}`} className="my-5 overflow-x-auto rounded-md border border-line bg-surface p-4 text-xs leading-5 text-foreground"><code>{code.join("\n")}</code></pre>);
  }
  flushBlocks();
  return <div>{blocks}</div>;
}
