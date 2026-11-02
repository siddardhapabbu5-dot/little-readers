import { Injectable } from "@nestjs/common";

@Injectable()
export class JobsService {
  getStatus() {
    return {
      engine: "bullmq",
      redisUrlConfigured: Boolean(process.env.REDIS_URL),
      processors: [] as string[],
      note: "Job processors are introduced from Phase 2 onward",
    };
  }
}
