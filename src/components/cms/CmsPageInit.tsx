"use client";

import { useEffect, useRef } from "react";
import { useCms } from "./CmsProvider";

interface CmsPageInitProps {
  pageSlug: string;
  blocks: Record<string, string>;
}

export default function CmsPageInit({ pageSlug, blocks }: CmsPageInitProps) {
  const { initPage } = useCms();
  const lastSnapshot = useRef<string>("");

  useEffect(() => {
    // Re-init whenever slug or block content actually changes (not on
    // every parent re-render). This is what makes language switching
    // work on CMS pages: when the server re-renders with the new locale's
    // blocks, the snapshot differs and we push the fresh content into the
    // CmsProvider. Previously a useRef boolean gated this to first-mount
    // only, leaving stale NL content visible after a locale switch.
    const snapshot = pageSlug + ":" + JSON.stringify(blocks);
    if (snapshot !== lastSnapshot.current) {
      initPage(pageSlug, blocks);
      lastSnapshot.current = snapshot;
    }
  }, [pageSlug, blocks, initPage]);

  return null;
}
