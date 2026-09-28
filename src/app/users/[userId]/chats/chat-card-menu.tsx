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
import { deleteChatAction, renameChatAction, type ChatActionResult } from "./actions";

type ChatCardMenuProps = {
  chatId: string;
  title: string;
  /** When set, deleting navigates here instead of only refreshing the list. */
  redirectTo?: string;
};

/**
 * Per-chat "⋯" menu: rename via a dialog, delete via a confirmation.
 *
 * Both mutations run as server actions, so `chatId` crosses the boundary as
 * plain data and the action re-authenticates — the browser cannot claim a
 * different identity.
 */
export function ChatCardMenu({ chatId, title, redirectTo }: ChatCardMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${title}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <RenameDialog chatId={chatId} title={title} />
        <DeleteChatDialog
          chatId={chatId}
          title={title}
          redirectTo={redirectTo}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RenameDialog({ chatId, title }: { chatId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [result, setResult] = useState<ChatActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // A successful rename closes the dialog; a rejected one keeps it open with
  // the backend's reason beside the field. Derived rather than stored so there
  // is no effect doing the closing.
  const show = open && result?.ok !== true;
  const error = result && !result.ok ? result.error : null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValue(title);
      setResult(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    startTransition(async () => {
      const next = await renameChatAction(chatId, trimmed);
      setResult(next);
      // The action's revalidatePath clears the server cache, but the tree
      // already on screen still shows the old title until it is re-fetched.
      if (next.ok) router.refresh();
    });
  };

  const trimmed = value.trim();
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= CHAT_TITLE_MAX_LENGTH &&
    trimmed !== title;

  return (
    <>
      <DropdownMenuItem onClick={() => setOpen(true)}>
        <Pencil />
        Rename
      </DropdownMenuItem>

      <Dialog open={show} onOpenChange={handleOpenChange}>
        <DialogContent>
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
              <p role="alert" className="text-sm text-destructive">
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
    </>
  );
}

function DeleteChatDialog({
  chatId,
  title,
  redirectTo,
}: {
  chatId: string;
  title: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setError(null);
  };

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
      setOpen(false);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Delete
      </DropdownMenuItem>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This chat will be removed from your chat list.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error && (
            <p role="alert" className="text-sm text-destructive">
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
                  variant="destructive"
                  disabled={isPending}
                  onClick={handleDelete}
                >
                  {isPending ? "Deleting…" : "Delete"}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
