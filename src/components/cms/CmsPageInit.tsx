"use client";

import { useEffect, useRef } from "react";
import { useCms } from "./CmsProvider";

interface CmsPageInitProps {
  pageSlug: string;
  blocks: Record<string, string>;
}

export default function CmsPageInit({ pageSlug, blocks }: CmsPageInitProps) {
  const { initPage } = useCms();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initPage(pageSlug, blocks);
      initialized.current = true;
    }
  }, [pageSlug, blocks, initPage]);

  return null;
}
