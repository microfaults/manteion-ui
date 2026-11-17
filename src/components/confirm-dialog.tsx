import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** Disables the confirm button while the action it started is in flight. */
  pending?: boolean;
  /** Why the last attempt failed, shown inside the dialog; the confirm button stays enabled to retry. */
  error?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Asks before a destructive or far-reaching action. Built on the flat
 * `Dialog` the experiment actions use: focus moves into the dialog (onto
 * Cancel first), and Escape, the close button and Cancel all dismiss it
 * without calling `onConfirm`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  error,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
