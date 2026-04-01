"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

interface CmsContextValue {
  pageSlug: string | null;
  blocks: Record<string, string>;
  drafts: Record<string, string>;
  editing: boolean;
  isDirty: boolean;
  activeBlock: string | null;
  initPage: (pageSlug: string, blocks: Record<string, string>) => void;
  updateDraft: (key: string, value: string) => void;
  getContent: (key: string) => string | undefined;
  setEditing: (editing: boolean) => void;
  setActiveBlock: (key: string | null) => void;
  commitDrafts: () => void;
  revert: () => void;
  getChangedBlocks: () => { blockKey: string; content: string }[];
}

const CmsContext = createContext<CmsContextValue | null>(null);

export function CmsProvider({ children }: { children: ReactNode }) {
  const [pageSlug, setPageSlug] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const isDirty = Object.keys(drafts).length > 0;

  const initPage = useCallback(
    (slug: string, savedBlocks: Record<string, string>) => {
      setPageSlug(slug);
      setBlocks(savedBlocks);
      setDrafts({});
    },
    []
  );

  const updateDraft = useCallback((key: string, value: string) => {
    setDrafts((prev) => {
      if (blocksRef.current[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const getContent = useCallback(
    (key: string) => {
      if (key in drafts) return drafts[key];
      if (key in blocks) return blocks[key];
      return undefined;
    },
    [drafts, blocks]
  );

  const commitDrafts = useCallback(() => {
    setBlocks((prev) => ({ ...prev, ...drafts }));
    setDrafts({});
  }, [drafts]);

  const revert = useCallback(() => {
    setDrafts({});
  }, []);

  const getChangedBlocks = useCallback(() => {
    return Object.entries(drafts).map(([blockKey, content]) => ({
      blockKey,
      content,
    }));
  }, [drafts]);

  return (
    <CmsContext.Provider
      value={{
        pageSlug,
        blocks,
        drafts,
        editing,
        isDirty,
        activeBlock,
        initPage,
        updateDraft,
        getContent,
        setEditing,
        setActiveBlock,
        commitDrafts,
        revert,
        getChangedBlocks,
      }}
    >
      {children}
    </CmsContext.Provider>
  );
}

export function useCms() {
  const ctx = useContext(CmsContext);
  if (!ctx) throw new Error("useCms must be used within CmsProvider");
  return ctx;
}
