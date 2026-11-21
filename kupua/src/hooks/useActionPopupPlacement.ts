import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useActionPopupPlacement(trigger: RefObject<HTMLElement | null>, popup: RefObject<HTMLElement | null>, open: boolean, preferBelow: boolean) {
  const [placement, setPlacement] = useState({ below: preferBelow, maxHeight: 320, shiftX: 0 });
  const shift = useRef(0);
  useLayoutEffect(() => {
    if (!open) return;
    let frame: number | undefined;
    const card = trigger.current?.closest<HTMLElement>("[data-bottom-sheet]");
    const update = () => {
      const triggerBounds = trigger.current?.getBoundingClientRect();
      const element = popup.current;
      if (!triggerBounds || !element) return;
      const visual = window.visualViewport;
      const top = visual?.offsetTop ?? 0;
      const left = visual?.offsetLeft ?? 0;
      const width = visual?.width ?? innerWidth;
      const above = Math.max(0, triggerBounds.top - top - 8);
      const belowSpace = Math.max(0, top + (visual?.height ?? innerHeight) - triggerBounds.bottom - 8);
      const desired = Math.min(element.scrollHeight || 320, 320);
      const below = preferBelow ? belowSpace >= desired || belowSpace >= above : !(above >= desired || above >= belowSpace);
      const bounds = element.getBoundingClientRect();
      const baseLeft = bounds.left - shift.current;
      const baseRight = bounds.right - shift.current;
      const shiftX = baseLeft < left + 8 ? left + 8 - baseLeft : baseRight > left + width - 8 ? left + width - 8 - baseRight : 0;
      shift.current = shiftX;
      const next = { below, maxHeight: below ? belowSpace : above, shiftX };
      setPlacement(current => current.below === next.below && current.maxHeight === next.maxHeight && current.shiftX === next.shiftX ? current : next);
    };
    const follow = () => {
      frame = undefined;
      update();
      if (card?.getAnimations?.().some(animation => animation.playState === "running" || animation.pending)) {
        frame = requestAnimationFrame(follow);
      }
    };
    const schedule = () => {
      update();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    card?.addEventListener("transitionrun", schedule);
    card?.addEventListener("transitionend", schedule);
    card?.addEventListener("transitioncancel", schedule);
    return () => {
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      card?.removeEventListener("transitionrun", schedule);
      card?.removeEventListener("transitionend", schedule);
      card?.removeEventListener("transitioncancel", schedule);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [open, preferBelow, trigger, popup]);
  return placement;
}