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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { DELETE_ACCOUNT_COPY } from "@/lib/account-lifecycle";
import { deleteAccountAction, type DeleteAccountResult } from "./actions";

type DeleteAccountDialogProps = {
  /** Shown to the user and compared against their input by the action. */
  email: string;
};

const COPY = DELETE_ACCOUNT_COPY["local-only"];

/**
 * Danger zone: type your email to confirm, then purge the account.
 *
 * The typed confirmation is re-checked server-side — matching text here only
 * decides whether the destructive button is enabled, not whether deletion is
 * allowed. On success the action redirects to logout, so there is no "done"
 * state to render on this side.
 */
export function DeleteAccountDialog({ email }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteAccountResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    setOpen(next);
    if (next) {
      setValue("");
      setError(null);
      setResult(null);
    }
  };

  const matches = value.trim() === email;
  const errorMessage =
    error ?? (result && !result.ok ? result.error : null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const next = await deleteAccountAction(value);
      // `ok: true` never reaches this component: the action redirects to
      // logout, which throws and navigates away. Anything here is a failure.
      if (!next.ok) {
        setResult(next);
        setError(next.error);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive">Delete account</Button>
        }
      >
        Delete account
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            {COPY.dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form
          onSubmit={(event) => event.preventDefault()}
          className="grid gap-3"
        >
          <div className="grid gap-2">
            <Label htmlFor="delete-account-confirmation">
              Type <span className="font-medium">{email}</span> to confirm
            </Label>
            <Input
              id="delete-account-confirmation"
              name="confirmation"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
              placeholder={email}
            />
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
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
                  type="button"
                  variant="destructive"
                  // Both guards matter: `matches` stops accidental fires and
                  // `isPending` prevents a double submit.
                  disabled={!matches || isPending}
                  onClick={handleDelete}
                >
                  {isPending ? "Deleting…" : COPY.buttonLabel}
                </Button>
              }
            />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
