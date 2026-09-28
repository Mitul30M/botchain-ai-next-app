"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Exchange = {
  user: string;
  agent: string;
};

/**
 * Sample exchanges, replayed on a loop so the card reads as a live session
 * rather than a screenshot. Each is a real shape the product handles: a plain
 * language request, then the node plan the agent proposes.
 */
const EXCHANGES: Exchange[] = [
  {
    user:
      "Every new Typeform response should be enriched with the company domain, then pushed to HubSpot.",
    agent:
      "Plan: Webhook trigger, HTTP request to enrich, field mapper, then a HubSpot upsert. Four nodes, one branch.",
  },
  {
    user: "Tell me which of my n8n workflows failed overnight and why.",
    agent:
      "Plan: Cron at 07:00, query the executions table, filter on status not equal to success, then summarise the error field per run.",
  },
  {
    user: "Send a Slack ping whenever a Stripe refund lands over 50 dollars.",
    agent:
      "Plan: Stripe webhook on charge.refunded, an IF node for amount greater than 5000 cents, then a Slack message to the finance channel.",
  },
  {
    user: "Digest the three RSS feeds I read every morning into one email.",
    agent:
      "Plan: Three RSS read nodes merged by a Set node, a Summarize node over the merged items, then a Gmail send at 08:00.",
  },
  {
    user: "Put every new lead from our web form into Airtable and nudge the sales channel.",
    agent:
      "Plan: Webhook trigger, Airtable create row, then a parallel branch so a Slack message and the Airtable write land together.",
  },
  {
    user: "File a PagerDuty incident when a production workflow errors more than five times an hour.",
    agent:
      "Plan: Hourly schedule, aggregate executions by workflow, an IF node on the error count, then a PagerDuty trigger.",
  },
  {
    user: "Copy yesterday's Stripe balance into a Google Sheet tab called Daily.",
    agent:
      "Plan: Schedule for 06:00, Stripe balance retrieve, then a Google Sheets append into the Daily sheet.",
  },
  {
    user: "When a support ticket arrives, create the Zendesk record and auto-reply to the sender.",
    agent:
      "Plan: Webhook trigger, Zendesk create ticket, a second branch for the reply, and a Set node to mark the run complete.",
  },
  {
    user: "Email me a short report of yesterday's signups from Postgres.",
    agent:
      "Plan: Postgres query grouped by day over the signups table, an LLM node to summarise the trend, then a Gmail send.",
  },
  {
    user: "Any Calendly booking should create a follow-up task in the CRM.",
    agent:
      "Plan: Calendly webhook on invitee.created, then a CRM create task with the invitee name and start time.",
  },
  {
    user: "Text shoppers who left something in the cart for more than a day.",
    agent:
      "Plan: Hourly schedule, filter carts by updated_at older than 24 hours, then an SMS node guarded by a Do Not Distribute check.",
  },
  {
    user: "Post a Discord message whenever a pull request is opened on our repo.",
    agent:
      "Plan: GitHub trigger on pull_request opened, a Summarize node for the diff stats, then a Discord webhook post.",
  },
  {
    user: "Turn meeting notes from Notion into a task list with owners.",
    agent:
      "Plan: Notion query for the last 24 hours of notes, an LLM node to extract action items, then a loop that creates each task.",
  },
  {
    user: "Ping Telegram if the website is unreachable for more than two minutes.",
    agent:
      "Plan: HTTP request every two minutes, an IF node on the status code, and a Telegram alert with the failed URL.",
  },
  {
    user: "Generate a PDF invoice per sale and email it to the customer.",
    agent:
      "Plan: Stripe trigger on a completed checkout, a PDF node rendering the invoice template, then a Gmail send with the PDF attached.",
  },
  {
    user: "Form submissions keep duplicating leads. Dedupe them on email and merge the records.",
    agent:
      "Plan: Webhook trigger, a Postgres upsert on the email key with a merge on conflict, then a Set node logging what merged.",
  },
  {
    user: "Every time someone books a demo, create a Salesforce opportunity at the right stage.",
    agent:
      "Plan: Webhook trigger, a Salesforce upsert matched on the contact email, then a Stage mapping node before the create.",
  },
  {
    user: "Watch a S3 bucket for new CSV uploads and validate the headers.",
    agent:
      "Plan: S3 trigger on object created, a Code node checking the header row against an allowlist, then an IF node for valid and invalid files.",
  },
  {
    user: "Post a summary of yesterday's GitHub commits in our standup channel.",
    agent:
      "Plan: Cron at 09:00, a GitHub list of merged pull requests since yesterday, a Summarize node, then a Slack message to the standup channel.",
  },
  {
    user: "Send an email when a Typeform score drops below fifty.",
    agent:
      "Plan: Typeform webhook, an IF node on the score field below 50, then a Gmail send that includes the answers for context.",
  },
  {
    user: "Retry failed payment webhooks up to three times before giving up.",
    agent:
      "Plan: Stripe trigger, a Loop node wrapping the charge step with a retry count, and an error branch firing after the third attempt.",
  },
  {
    user: "Pull all open pull requests into a Google Doc review checklist.",
    agent:
      "Plan: GitHub list of open pull requests, a Code node building a per-PR checklist, then a Google Docs create with the formatted content.",
  },
  {
    user: "Add every new Notion page under Sales to a Monday board.",
    agent:
      "Plan: Notion database query filtered to the Sales parent, then a Monday item create for each page returned.",
  },
  {
    user: "Alert the on-call if our error rate doubles within five minutes.",
    agent:
      "Plan: Schedule every five minutes, a Postgres query on the error rate window, an IF node comparing against the previous interval, then a PagerDuty trigger.",
  },
  {
    user: "Turn all positive Jira tickets into thank-you emails to the reporter.",
    agent:
      "Plan: Jira trigger on status change, an IF node on the resolved category, then a Gmail template send to the reporter field.",
  },
  {
    user: "Show a live count of active users on the marketing site.",
    agent:
      "Plan: Webhook trigger for sign-in and sign-out, a Redis increment and decrement on the user key, then an HTTP endpoint returning the current count.",
  },
  {
    user: "Mirror new Drive files into a Dropbox folder the team shares.",
    agent:
      "Plan: Google Drive trigger on file created, a rename node normalising the path, then a Dropbox upload to the shared folder.",
  },
  {
    user: "Every Sunday, summarise the week's top support themes for the product team.",
    agent:
      "Plan: Weekly cron, a Zendesk search for the last seven days, a Summarize node clustering the ticket subjects, then a Gmail send to the product list.",
  },
  {
    user: "Add a Stripe customer whenever a user signs up through GitHub OAuth.",
    agent:
      "Plan: Webhook trigger on the signup event, a Code node mapping the OAuth profile to Stripe fields, then a Stripe customer create.",
  },
  {
    user: "Back up the orders table to a spreadsheet every night.",
    agent:
      "Plan: Cron at 02:00, a Postgres read of rows changed since the last run, then a Google Sheets append into the Orders tab.",
  },
  {
    user: "Reply to every one-star review with a personal apology.",
    agent:
      "Plan: Trigger on a new store review, an IF node on rating equal to 1, then a Gmail send with the reviewer name in the body.",
  },
  {
    user: "Post our daily signups and churn numbers in the Slack metrics channel.",
    agent:
      "Plan: Postgres query returning signups and churn per day, a Code node formatting the two figures, then a Slack message at the same hour each morning.",
  },
  {
    user: "When a shipment is delivered, ask the customer for a review.",
    agent:
      "Plan: Webhook trigger on the delivered event, a Wait node pausing three days, then an email send with the review link.",
  },
  {
    user: "Pull the latest exchange rates and update the prices in our catalogue.",
    agent:
      "Plan: HTTP request to the rates API, a Code node converting and applying them, then a Postgres update scoped to the affected products.",
  },
  {
    user: "Tell me which invoices are unpaid past thirty days.",
    agent:
      "Plan: Postgres query filtering invoices by amount_due and due_date, a Code node aging each row into a bucket, then a Gmail send listing them.",
  },
  {
    user: "Log every deploy from GitHub into our changelog document.",
    agent:
      "Plan: GitHub trigger on a release published, a Code node building a changelog line from the release notes, then a Google Docs append.",
  },
  {
    user: "Text the sales rep when a deal closes above ten thousand dollars.",
    agent:
      "Plan: HubSpot trigger on deal stage change, an IF node above 10000, then a Twilio SMS to the deal owner field.",
  },
  {
    user: "Keep our Slack channels in order by filing new members into a queue.",
    agent:
      "Plan: Slack trigger on a member join, a Redis list push with the channel name, then a Schedule trigger draining the queue hourly.",
  },
  {
    user: "Scan uploaded invoices for a total and flag anything under fifty dollars.",
    agent:
      "Plan: Webhook trigger on upload, an LLM node extracting the total from the document, then an IF node flagging totals below 50 for review.",
  },
  {
    user: "Send a monthly usage summary to each customer from our metering table.",
    agent:
      "Plan: Monthly cron, a Postgres group-by on the metering table per account, a Code node building a per-customer digest, then a loop that emails each one.",
  },
  {
    user: "Auto-tag a GitHub issue with a label based on its contents.",
    agent:
      "Plan: GitHub trigger on issue opened, an LLM node picking the closest labels, then a GitHub call adding them to the issue.",
  },
  {
    user: "Mirror every Stripe charge into a Notion revenue tracker.",
    agent:
      "Plan: Stripe trigger on a successful charge, a Postgres upsert keyed on the payment intent, then a Notion row appended to the tracker.",
  },
  {
    user: "Quiet the alerts while we migrate, then bring them back.",
    agent:
      "Plan: A Stop And Error branch behind a maintenance flag in a Postgres config table, so enabling the flag short-circuits the alert path.",
  },
  {
    user: "Check our uptime endpoint and record the result in a log I can read later.",
    agent:
      "Plan: Cron every two minutes, an HTTP request to the health endpoint, then a Postgres insert with the status code and check time.",
  },
  {
    user: "Create a HubSpot deal whenever an enterprise trial starts.",
    agent:
      "Plan: Webhook trigger on trial start, an IF node on the plan field, then a HubSpot deal create with the right pipeline stage.",
  },
  {
    user: "Draft a follow-up email for every deal that has gone quiet.",
    agent:
      "Plan: Cron daily, a HubSpot search for deals with no activity in seven days, an LLM node drafting the note, then a Gmail draft to create.",
  },
  {
    user: "Give me one Slack message each morning with what is on fire.",
    agent:
      "Plan: Fan out to PagerDuty, Sentry, and a Postgres count of failed runs, a Summarize node ranking them, then one Slack message to the on-call channel.",
  },
  {
    user: "Keep a Google Sheet in sync with our Airtable base.",
    agent:
      "Plan: Airtable trigger on a record change, a Code node diffing against the last synced row, then a Sheets update only for changed fields.",
  },
  {
    user: "Archive transcripts older than ninety days into cold storage.",
    agent:
      "Plan: Schedule weekly, a Postgres select on the age of the transcript rows, then a loop that copies each file to an S3 Glacier bucket.",
  },
  {
    user: "Ping me if a customer signs up but never finishes onboarding.",
    agent:
      "Plan: Postgres tracking signups against onboarding completion, a Schedule trigger checking for the gap, then a Slack DM after three days.",
  },
  {
    user: "Renew the DNS record before it expires so we never lose the domain.",
    agent:
      "Plan: Cron daily, an HTTP request reading the record expiry, an IF node inside the warning window, then an email a month ahead.",
  },
  {
    user: "Push every new review to the product board with its sentiment score.",
    agent:
      "Plan: Trigger on a new review, an LLM node scoring sentiment from one to five, then a Linear issue create carrying the score.",
  },
  {
    user: "Sync our inventory to the storefront every fifteen minutes.",
    agent:
      "Plan: Schedule every fifteen minutes, a Postgres read of stock levels, then a Shopify inventory update per SKU that changed.",
  },
];

const TYPE_SPEED_USER = 42;
const TYPE_SPEED_AGENT = 34;
const PAUSE_AFTER_USER = 550;
const PAUSE_AFTER_AGENT = 2800;

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary align-text-bottom"
    />
  );
}

export function LiveSession() {
  // Start on a complete exchange. It is what the server renders, what a visitor
  // with reduced motion sees, and the frame painted before the loop takes over.
  const [userText, setUserText] = useState(EXCHANGES[0].user);
  const [agentText, setAgentText] = useState(EXCHANGES[0].agent);
  const [phase, setPhase] = useState<"user" | "agent" | "settled">("settled");

  useEffect(() => {
    // Decorative motion, so honour the OS setting and keep the static frame.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    // Reveal one character at a time; `false` means the loop was torn down.
    async function typeOut(
      setText: (value: string) => void,
      text: string,
      charsPerSecond: number,
    ): Promise<boolean> {
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) return false;
        setText(text.slice(0, i));
        await sleep(1000 / charsPerSecond + Math.random() * 24);
      }
      return true;
    }

    (async () => {
      // Let the pre-rendered frame paint before the first reset.
      await sleep(0);

      let index = Math.floor(Math.random() * EXCHANGES.length);
      while (!cancelled) {
        const exchange = EXCHANGES[index % EXCHANGES.length];
        index += 1;

        setAgentText("");
        setPhase("user");
        if (!(await typeOut(setUserText, exchange.user, TYPE_SPEED_USER))) {
          return;
        }

        await sleep(PAUSE_AFTER_USER);
        if (cancelled) return;

        setPhase("agent");
        if (!(await typeOut(setAgentText, exchange.agent, TYPE_SPEED_AGENT))) {
          return;
        }

        setPhase("settled");
        await sleep(PAUSE_AFTER_AGENT);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="bg-card">
      <CardHeader>
        <Badge variant="outline" className="w-fit">
          Live session
        </Badge>
        <CardTitle>From one sentence to a running workflow</CardTitle>
      </CardHeader>

      {/* The animation repletes forever, so it is hidden from assistive tech
          and paired with a static summary below. */}
      <CardContent className="flex flex-col gap-3">
        <div
          aria-hidden
          className="flex h-44 flex-col justify-end gap-3 overflow-hidden"
        >
          <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            <span className="text-xs text-muted-foreground">You</span>
            <span>
              {userText}
              {phase === "user" && <Caret />}
            </span>
          </div>

          {agentText.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm text-foreground">
              <span className="text-xs text-muted-foreground">BotChain AI</span>
              <span>
                {agentText}
                {phase === "agent" && <Caret />}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {phase === "settled" ? "Waiting for your approval" : "Planning"}
          </span>
          <Badge variant="secondary">
            {phase === "settled" ? "Review" : "Working"}
          </Badge>
        </div>

        <p className="sr-only">
          Example session: you describe an automation in plain language and
          BotChain AI replies with the n8n node plan, then pauses for your
          approval before making any change.
        </p>
      </CardContent>
    </Card>
  );
}
