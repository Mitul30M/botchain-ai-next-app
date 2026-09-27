"use client";

import { Button } from "@/components/ui/button";
import { Download, FileJson } from "lucide-react";
import {
  attachmentHref,
  formatBytes,
  type AttachmentOut,
} from "@/lib/chat-types";

export type WorkflowAttachmentProps = {
  attachment: AttachmentOut;
};

/**
 * Download link for the generated n8n workflow JSON. The href points at this
 * app's proxy so the Kinde token never reaches the browser.
 */
export function WorkflowAttachment({ attachment }: WorkflowAttachmentProps) {
  const href = attachmentHref(attachment);
  const size = formatBytes(attachment.size_bytes);

  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-border p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <FileJson className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.file_name}</p>
        <p className="text-xs text-muted-foreground">
          {attachment.file_type}
          {size ? ` · ${size}` : ""}
        </p>
      </div>
      <Button
        render={<a href={href} download={attachment.file_name} />}
        variant="outline"
        size="sm"
      >
        <Download />
        Download
      </Button>
    </div>
  );
}
