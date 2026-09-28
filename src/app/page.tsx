import {
  LoginLink,
  LogoutLink,
  RegisterLink,
} from "@kinde-oss/kinde-auth-nextjs/components";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { getUser } from "@/lib/user";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Bot,
  Gauge,
  LayoutTemplate,
  MessageSquare,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: MessageSquare,
    title: "Plain language in",
    body: "Describe a lead-enrichment flow in a sentence. The agent turns it into n8n nodes, wires up the edges, and explains what it changed.",
  },
  {
    icon: Workflow,
    title: "Real n8n workflows",
    body: "Not pseudocode or a checklist of suggestions. You get a workflow that imports straight into your own n8n instance and runs there.",
  },
  {
    icon: ShieldCheck,
    title: "Approval before deploy",
    body: "Nothing touches production unattended. The agent pauses and waits for you to approve each write and deploy.",
  },
  {
    icon: LayoutTemplate,
    title: "Templates first",
    body: "When a proven template fits the job, the agent starts there and adapts it, instead of inventing structure from scratch.",
  },
  {
    icon: Gauge,
    title: "Layered validation",
    body: "Node parameters are checked before the workflow is saved, so a broken graph fails in the editor rather than in production.",
  },
  {
    icon: Bot,
    title: "Many chats, one account",
    body: "Every conversation is its own thread with its own history, so parallel automations stay separate and searchable.",
  },
];

const STEPS: Feature[] = [
  {
    icon: MessageSquare,
    title: "Ask",
    body: "Tell the agent the outcome you want and which systems it needs to reach.",
  },
  {
    icon: ShieldCheck,
    title: "Review",
    body: "Read the plan, inspect every node, then approve or reject the change.",
  },
  {
    icon: Workflow,
    title: "Ship",
    body: "Import into n8n, switch the workflow on, and keep iterating in the same chat.",
  },
];

export default async function Home() {
  const { isAuthenticated, getUser: getKindeUser } = getKindeServerSession();
  const isLoggedIn = await isAuthenticated();
  const kindeUser = isLoggedIn ? await getKindeUser() : null;
  const localUser = kindeUser ? await getUser(kindeUser.id) : null;

  // A Kinde session can outlive its local row, so fall back to the sync route
  // rather than linking to `/users/undefined`. Sync mints the row and redirects
  // on to the chats page.
  const dashboardHref = localUser
    ? `/users/${localUser.id}/chats`
    : "/api/auth/sync";

  return (
    <section className="flex w-full max-w-6xl self-center border-x border-border flex-1 items-center flex-col">
      <header className="sticky top-0 z-20 w-full border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bot className="size-3.5" />
            </span> */}
            <span className="text-sm font-semibold text-foreground">
              BotChain AI
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <Link
                  href={dashboardHref}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Dashboard
                </Link>
                <LogoutLink className={buttonVariants({ variant: "outline" })}>
                  Log out
                </LogoutLink>
              </>
            ) : (
              <>
                <LoginLink className={buttonVariants({ variant: "default" })}>
                  Log in
                </LoginLink>
                <RegisterLink
                  className={buttonVariants({ variant: "outline" })}
                >
                  Sign up
                </RegisterLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full flex-1 flex-col gap-6 py-6">
        <div className="grid gap-6 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <Badge variant="secondary" className="w-fit">
              n8n automation, minus the node spaghetti
            </Badge>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
              Describe the automation. Watch an agent build it.
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              BotChain AI turns a plain-language request into a real, validated
              n8n workflow on your own instance — and asks before it changes
              anything that runs in production.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isLoggedIn ? (
                <Link
                  href={dashboardHref}
                  className={buttonVariants({ variant: "default", size: "lg" })}
                >
                  Open dashboard
                  <ArrowRight data-icon="inline-end" />
                </Link>
              ) : (
                <>
                  <RegisterLink
                    className={buttonVariants({
                      variant: "default",
                      size: "lg",
                    })}
                  >
                    Get started
                    <ArrowRight data-icon="inline-end" />
                  </RegisterLink>
                  <LoginLink
                    className={buttonVariants({
                      variant: "outline",
                      size: "lg",
                    })}
                  >
                    Log in
                  </LoginLink>
                </>
              )}
            </div>
          </div>

          <Card className="bg-card">
            <CardHeader>
              <Badge variant="outline" className="w-fit">
                Live session
              </Badge>
              <CardTitle>Enrich new Typeform leads into HubSpot</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                <span className="text-xs text-muted-foreground">You</span>
                <span>
                  Every new Typeform response should be enriched with the
                  company domain, then pushed to HubSpot.
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm text-foreground">
                <span className="text-xs text-muted-foreground">
                  BotChain AI
                </span>
                <span>
                  Plan: Webhook trigger, HTTP request to enrich, field mapper,
                  then a HubSpot upsert. Four nodes, one branch.
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Waiting for your approval
                </span>
                <Badge variant="secondary">Review</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="border-accent-foreground my-0" />

        <div className="flex flex-col gap-1 px-4 sm:px-6">
          <h2 className="text-xl font-semibold leading-10 tracking-tight text-foreground">
            Built for the whole handoff
          </h2>
          <p className="text-sm text-muted-foreground">
            From the first sentence to a workflow running in n8n.
          </p>
        </div>

        <div className="grid gap-4 px-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="hover:bg-muted/40">
              <CardHeader>
                {/* <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  
                </span> */}
                <div className="flex gap-2 w-max">
                  <feature.icon className="size-4" />
                  <CardTitle>{feature.title}</CardTitle>
                </div>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Separator className="border-accent-foreground my-0" />

        <div className="grid gap-4 px-4 sm:px-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <Card key={step.title} className="hover:bg-muted/40">
              <CardHeader>
                {/* <Badge variant="secondary" className="w-fit">
                  Step {index + 1}
                </Badge> */}
                <CardTitle className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="w-fit">
                    Step {index + 1}
                  </Badge>
                  {step.title}{" "}
                </CardTitle>
                <CardDescription>{step.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 px-4 py-6 text-center sm:px-6">
          <h2 className="text-xl font-semibold leading-10 tracking-tight text-foreground">
            Start with one workflow
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Every new account starts with free credits, so you can go from a
            sentence to a live n8n workflow without a credit card.
          </p>
          {isLoggedIn ? (
            <Link
              href={dashboardHref}
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              Open dashboard
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : (
            <RegisterLink
              className={buttonVariants({ variant: "default", size: "lg" })}
            >
              Create your account
              <ArrowRight data-icon="inline-end" />
            </RegisterLink>
          )}
        </div>
      </main>
    </section>
  );
}
