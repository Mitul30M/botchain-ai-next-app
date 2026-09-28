"use client";

import { useState, type ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

/**
 * Client shell around the chat-list overflow.
 *
 * `children` is server-rendered by the dashboard page and passed straight
 * through, so the rows inside stay server components — only the open/closed
 * state lives here.
 */
export function MoreChats({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger
        render={<Button variant="outline" className="w-fit" />}
      >
        {open ? "Hide" : "Show"} {count} more {count === 1 ? "chat" : "chats"}
        <ChevronDown
          data-icon="inline-end"
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
