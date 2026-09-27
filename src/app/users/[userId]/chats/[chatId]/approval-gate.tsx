"use client";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Textarea } from "@/components/ui/textarea";
import type { MessageApproval, MessageSpec } from "@/lib/chat-types";
import { useState } from "react";

export type ApprovalGateProps = {
  /** Backend row id of the assistant message that opened the gate. */
  messageId: string;
  spec?: MessageSpec | null;
  approval: MessageApproval;
  busy?: boolean;
  onApprove: () => void;
  onReject: (feedback: string) => void;
};

function SpecList({ spec }: { spec: MessageSpec }) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Trigger", spec.trigger_type],
    ["Services", spec.services_involved?.join(", ")],
    ["Conditions", spec.conditions_logic],
    ["Data flow", spec.data_flow],
    ["Constraints", spec.constraints],
  ];

  const shown = rows.filter(([, value]) => Boolean(value));
  const questions = spec.open_questions?.filter(Boolean) ?? [];
  if (shown.length === 0 && questions.length === 0) return null;

  return (
    <dl className="mt-1 grid gap-1.5 text-xs">
      {shown.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1">{value}</dd>
        </div>
      ))}
      {questions.length > 0 && (
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Open</dt>
          <dd className="min-w-0 flex-1">
            <ul className="list-disc pl-4">
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * The human-approval gate the agent stops at before it touches n8n.
 *
 * The backend parks the chat with `meta.approval.status === "pending"` rather
 * than emitting a DSP tool-approval part, so the `Confirmation` primitives are
 * reused as presentational components with an explicit `state`.
 */
export function ApprovalGate({
  messageId,
  spec,
  approval,
  busy = false,
  onApprove,
  onReject,
}: ApprovalGateProps) {
  const [rejecting, setRejecting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const pending = approval.status === "pending";
  const state = pending ? "approval-requested" : "approval-responded";

  return (
    <Confirmation
      state={state}
      approval={
        pending
          ? { id: messageId }
          : { id: messageId, approved: approval.status === "approved" }
      }
    >
      <ConfirmationTitle>
        {pending ? "Ready to build this workflow" : "Approval resolved"}
      </ConfirmationTitle>

      {pending && spec?.goal && (
        <p className="text-sm text-muted-foreground">{spec.goal}</p>
      )}
      {pending && spec && <SpecList spec={spec} />}

      <ConfirmationRequest>
        {rejecting ? (
          <div className="flex w-full flex-col gap-2">
            <Textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="What should the agent change instead? (optional)"
              className="min-h-16 text-sm"
              maxLength={2000}
              disabled={busy}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <ConfirmationAction
                variant="ghost"
                disabled={busy}
                onClick={() => setRejecting(false)}
              >
                Cancel
              </ConfirmationAction>
              <ConfirmationAction
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setRejecting(false);
                  onReject(feedback.trim());
                }}
              >
                {busy ? "Sending…" : "Confirm rejection"}
              </ConfirmationAction>
            </div>
          </div>
        ) : (
          <ConfirmationActions>
            <ConfirmationAction
              variant="ghost"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              Reject
            </ConfirmationAction>
            <ConfirmationAction
              variant="default"
              disabled={busy}
              onClick={onApprove}
            >
              {busy ? "Working…" : "Approve & build"}
            </ConfirmationAction>
          </ConfirmationActions>
        )}
      </ConfirmationRequest>

      <ConfirmationAccepted>
        <p className="text-xs text-muted-foreground">
          {approval.feedback
            ? `Approved with feedback: ${approval.feedback}`
            : "Approved. The agent is building the workflow."}
        </p>
      </ConfirmationAccepted>

      <ConfirmationRejected>
        <p className="text-xs text-muted-foreground">
          {approval.feedback
            ? `Rejected: ${approval.feedback}`
            : "Rejected. The agent will revise the plan."}
        </p>
      </ConfirmationRejected>
    </Confirmation>
  );
}
