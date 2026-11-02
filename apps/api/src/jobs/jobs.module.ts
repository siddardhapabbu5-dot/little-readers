import { Module } from "@nestjs/common";
import { JobsService } from "./jobs.service";

/**
 * BullMQ wiring lands in Phase 2+.
 * Phase 1 only exposes queue configuration status.
 */
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
