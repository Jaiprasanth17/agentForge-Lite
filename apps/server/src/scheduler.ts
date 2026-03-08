import * as cron from "node-cron";
import prisma from "./db/prismaClient";
import { executeWorkflow } from "./orchestrator/workflowRunner";

const scheduledJobs = new Map<string, cron.ScheduledTask>();

export async function initScheduler(): Promise<void> {
  console.log("[Scheduler] Initializing...");

  const workflows = await prisma.workflow.findMany({
    where: {
      status: "active",
      trigger: "schedule",
      scheduleCron: { not: null },
    },
  });

  for (const workflow of workflows) {
    if (workflow.scheduleCron && cron.validate(workflow.scheduleCron)) {
      registerCronJob(workflow.id, workflow.scheduleCron, workflow.name);
    }
  }

  console.log(`[Scheduler] Registered ${scheduledJobs.size} cron job(s)`);
}

export function registerCronJob(workflowId: string, cronExpr: string, name: string): void {
  // Remove existing job if any
  unregisterCronJob(workflowId);

  if (!cron.validate(cronExpr)) {
    console.warn(`[Scheduler] Invalid cron expression for workflow ${name}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] Triggering workflow: ${name} (${workflowId})`);
    try {
      const run = await prisma.workflowRun.create({
        data: {
          workflowId,
          status: "queued",
          log: JSON.stringify([]),
        },
      });
      await executeWorkflow(workflowId, run.id);
    } catch (err) {
      console.error(`[Scheduler] Failed to execute workflow ${name}:`, err);
    }
  });

  scheduledJobs.set(workflowId, task);
  console.log(`[Scheduler] Registered cron job for "${name}": ${cronExpr}`);
}

export function unregisterCronJob(workflowId: string): void {
  const existing = scheduledJobs.get(workflowId);
  if (existing) {
    existing.stop();
    scheduledJobs.delete(workflowId);
  }
}
