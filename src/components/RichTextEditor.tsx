"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function IconBold() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2.5h5a3 3 0 0 1 0 6H4zM4 8.5h6a3 3 0 0 1 0 6H4z" />
    </svg>
  );
}

function IconItalic() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5H6M10 13.5H6M9.5 2.5L6.5 13.5" />
    </svg>
  );
}

function IconH2() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <text x="1" y="12.5" fontSize="10" fontWeight="700" fontFamily="system-ui">H2</text>
    </svg>
  );
}

function IconH3() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <text x="1" y="12.5" fontSize="10" fontWeight="700" fontFamily="system-ui">H3</text>
    </svg>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="3" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
      <path d="M6.5 4h7M6.5 8h7M6.5 12h7" />
    </svg>
  );
}

function IconOrderedList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <text x="1" y="5.5" fontSize="6" fontWeight="600" fontFamily="system-ui">1.</text>
      <text x="1" y="9.5" fontSize="6" fontWeight="600" fontFamily="system-ui">2.</text>
      <text x="1" y="13.5" fontSize="6" fontWeight="600" fontFamily="system-ui">3.</text>
      <rect x="6.5" y="3" width="7" height="1.5" rx="0.5" />
      <rect x="6.5" y="7" width="7" height="1.5" rx="0.5" />
      <rect x="6.5" y="11" width="7" height="1.5" rx="0.5" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h7a4 4 0 0 1 0 8H8" />
      <path d="M6 3L3 6l3 3" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 6H6a4 4 0 0 0 0 8h2" />
      <path d="M10 3l3 3-3 3" />
    </svg>
  );
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
  minHeight = 120,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap",
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor }) => {
      // Treat an empty editor as an empty string instead of "<p></p>"
      // so auto-save doesn't churn.
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Keep the editor in sync with external `content` changes (server
  // refresh, reset, etc.). Tiptap only reads `content` on creation,
  // so without this the editor would keep showing the initial value.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    // Normalise both sides to avoid the empty-paragraph vs "" diff.
    const incoming = content || "";
    const normalisedCurrent = current === "<p></p>" ? "" : current;
    if (normalisedCurrent === incoming) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [content, editor]);

  if (!editor) return null;

  function handleLink() {
    const existing = editor!.getAttributes("link").href || "";
    const url = window.prompt("URL", existing);
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }

  const tools: {
    icon: React.ReactNode;
    title: string;
    action: () => void;
    active: boolean;
  }[] = [
    {
      icon: <IconBold />,
      title: "Bold (Ctrl+B)",
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
    },
    {
      icon: <IconItalic />,
      title: "Italic (Ctrl+I)",
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
    },
    {
      icon: <IconH2 />,
      title: "Heading 2",
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive("heading", { level: 2 }),
    },
    {
      icon: <IconH3 />,
      title: "Heading 3",
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive("heading", { level: 3 }),
    },
    {
      icon: <IconList />,
      title: "Bulleted list",
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
    },
    {
      icon: <IconOrderedList />,
      title: "Numbered list",
      action: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
    },
    {
      icon: <IconLink />,
      title: "Link",
      action: handleLink,
      active: editor.isActive("link"),
    },
  ];

  const undoRedo: { icon: React.ReactNode; title: string; action: () => void }[] = [
    { icon: <IconUndo />, title: "Undo", action: () => editor.chain().focus().undo().run() },
    { icon: <IconRedo />, title: "Redo", action: () => editor.chain().focus().redo().run() },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-green-200 focus-within:border-green-400 focus-within:ring-1 focus-within:ring-green-400">
      <div className="flex items-center gap-0.5 border-b border-green-100 bg-green-50/50 px-1.5 py-1">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            onClick={t.action}
            className={`rounded p-1.5 transition-colors ${
              t.active
                ? "bg-green-800 text-white"
                : "text-green-600 hover:bg-green-100 hover:text-green-900"
            }`}
          >
            {t.icon}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-green-200" />
        {undoRedo.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            onClick={t.action}
            className="rounded p-1.5 text-green-500 transition-colors hover:bg-green-100 hover:text-green-800"
          >
            {t.icon}
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        style={{ ["--tiptap-min-height" as string]: `${minHeight}px` }}
        className={`max-w-none px-4 py-3 focus-within:outline-none
          [&_.tiptap]:min-h-[var(--tiptap-min-height)] [&_.tiptap]:outline-none
          [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:text-green-950 [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:mb-2
          [&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:text-green-900 [&_.tiptap_h3]:mt-3 [&_.tiptap_h3]:mb-1
          [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ul]:my-2
          [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ol]:my-2
          [&_.tiptap_li]:my-0.5
          [&_.tiptap_p]:my-1
          [&_.tiptap_a]:text-green-700 [&_.tiptap_a]:underline
          [&_.tiptap_strong]:font-semibold
          [&_.tiptap_em]:italic
          text-green-950 text-[15px] leading-relaxed`}
      />
    </div>
  );
}
