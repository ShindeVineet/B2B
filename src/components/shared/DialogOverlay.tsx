"use client";

import { useSyncExternalStore, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import styles from "./DialogOverlay.module.css";

const subscribe = () => () => {};

/** Portals prevent map/filter transforms from clipping fixed dialogs. */
export function DialogOverlay(props: HTMLAttributes<HTMLDivElement>) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" {...props} className={`${props.className || ""} ${styles.overlay}`} data-dialog-overlay="true" />,
    document.body,
  );
}
