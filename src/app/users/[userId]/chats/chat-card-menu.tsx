"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CHAT_TITLE_MAX_LENGTH } from "@/lib/chat-limits";
import {
  deleteChatAction,
  renameChatAction,
  type ChatActionResult,
} from "./actions";

type ChatCardMenuProps = {
  chatId: string;
  title: string;
  /** When set, deleting navigates here instead of only refreshing the list. */
  redirectTo?: string;
};

type PendingAction = "rename" | "delete" | null;

/**
 * Per-chat "⋯" menu: rename via a dialog, delete via a confirmation.
 *
 * The dialogs are rendered as *siblings* of the dropdown, not children of
 * `DropdownMenuContent`. A menu item always dismisses the menu, and anything
 * portalled inside that content — a dialog included — is unmounted with it, so
 * nesting them makes the popup flash for a frame and vanish. Here the menu only
 * records which dialog to open; the dialog's lifetime is independent.
 *
 * Both mutations run as server actions, so `chatId` crosses the boundary as
 * plain data and the action re-authenticates — the browser cannot claim a
 * different identity.
 */
export function ChatCardMenu({ chatId, title, redirectTo }: ChatCardMenuProps) {
  const [action, setAction] = useState<PendingAction>(null);
  const close = () => setAction(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${title}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={() => setAction("rename")}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction("delete")}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so each opening starts from a clean field. */}
      {action === "rename" && (
        <RenameDialog
          chatId={chatId}
          title={title}
          onOpenChange={(open) => !open && close()}
        />
      )}
      {action === "delete" && (
        <DeleteChatDialog
          chatId={chatId}
          title={title}
          redirectTo={redirectTo}
          onOpenChange={(open) => !open && close()}
        />
      )}
    </>
  );
}

function RenameDialog({
  chatId,
  title,
  onOpenChange,
}: {
  chatId: string;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result: ChatActionResult = await renameChatAction(
        chatId,
        value.trim(),
      );
      if (!result.ok) {
        // A rejected title keeps the dialog open with the backend's reason
        // beside the field, so nothing has to be retyped.
        setError(result.error);
        return;
      }
      // The action's revalidatePath clears the server cache, but the tree
      // already on screen still shows the old title until it is re-fetched.
      router.refresh();
      onOpenChange(false);
    });
  };

  const trimmed = value.trim();
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= CHAT_TITLE_MAX_LENGTH &&
    trimmed !== title;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-background">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>
            Pick a new title. Up to {CHAT_TITLE_MAX_LENGTH} characters.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`rename-${chatId}`}>Title</Label>
            <Input
              id={`rename-${chatId}`}
              name="title"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={CHAT_TITLE_MAX_LENGTH}
              autoComplete="off"
              disabled={isPending}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={isPending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteChatDialog({
  chatId,
  title,
  redirectTo,
  onOpenChange,
}: {
  chatId: string;
  title: string;
  redirectTo?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteChatAction(chatId);
      if (!result.ok) {
        // 409 lands here: the backend's sentence is shown as-is so the user
        // knows to wait for the run to finish rather than that it broke.
        setError(result.error);
        return;
      }
      onOpenChange(false);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      router.refresh();
    });
  };

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-background">
        <AlertDialogHeader>
          <AlertDialogMedia className="text-muted-foreground">
            <TriangleAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the chat from your list along with its messages and
            attachments. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            render={
              <Button variant="outline" disabled={isPending}>
                Cancel
              </Button>
            }
          />
          <AlertDialogAction
            render={
              <Button
                // Neutral primary, matching the Danger zone card's palette.
                variant="default"
                disabled={isPending}
                onClick={handleDelete}
              >
                {isPending ? "Deleting…" : "Delete chat"}
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
