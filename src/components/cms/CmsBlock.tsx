"use client";

import { useCallback } from "react";
import { useCms } from "./CmsProvider";

interface CmsBlockProps {
  page: string;
  block: string;
  fallback: string;
  content?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "blockquote" | "div";
  className?: string;
}

export default function CmsBlock({
  page,
  block,
  fallback,
  content: serverContent,
  as: Tag = "span",
  className,
}: CmsBlockProps) {
  const { getContent, editing, activeBlock, setActiveBlock, pageSlug } =
    useCms();

  const contextContent = pageSlug === page ? getContent(block) : undefined;
  const displayText = contextContent ?? serverContent ?? fallback;

  const handleClick = useCallback(() => {
    if (editing && pageSlug === page) {
      setActiveBlock(block);
    }
  }, [editing, pageSlug, page, block, setActiveBlock]);

  const renderContent = (text: string) => {
    const parts: Array<{
      type: "text" | "bold" | "italic" | "link";
      text: string;
      href?: string;
    }> = [];
    let remaining = text;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(
        /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/
      );
      const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);

      const matches = [
        boldMatch && {
          idx: boldMatch.index!,
          len: boldMatch[0].length,
          type: "bold" as const,
          text: boldMatch[1],
        },
        italicMatch && {
          idx: italicMatch.index!,
          len: italicMatch[0].length,
          type: "italic" as const,
          text: italicMatch[1],
        },
        linkMatch && {
          idx: linkMatch.index!,
          len: linkMatch[0].length,
          type: "link" as const,
          text: linkMatch[1],
          href: linkMatch[2],
        },
      ].filter(Boolean) as Array<{
        idx: number;
        len: number;
        type: "bold" | "italic" | "link";
        text: string;
        href?: string;
      }>;

      if (matches.length === 0) {
        parts.push({ type: "text", text: remaining });
        break;
      }

      matches.sort((a, b) => a.idx - b.idx);
      const first = matches[0];

      if (first.idx > 0) {
        parts.push({ type: "text", text: remaining.slice(0, first.idx) });
      }
      parts.push({ type: first.type, text: first.text, href: first.href });
      remaining = remaining.slice(first.idx + first.len);
    }

    return parts.map((part, i) => {
      switch (part.type) {
        case "bold":
          return <strong key={i}>{part.text}</strong>;
        case "italic":
          return <em key={i}>{part.text}</em>;
        case "link":
          return (
            <a key={i} href={part.href} className="underline">
              {part.text}
            </a>
          );
        default:
          return <span key={i}>{part.text}</span>;
      }
    });
  };

  const isActive = editing && pageSlug === page && activeBlock === block;

  return (
    <Tag
      className={`${className ?? ""} ${
        editing && pageSlug === page
          ? "outline-dashed outline-1 outline-gold-400/30 hover:outline-gold-400/60 cursor-pointer transition-all"
          : ""
      } ${isActive ? "outline-gold-400/80 outline-2" : ""}`.trim()}
      onClick={handleClick}
      data-cms-block={block}
      data-cms-page={page}
    >
      {renderContent(displayText)}
    </Tag>
  );
}
