import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as schoolService from "./school.service.js";
import * as teacherService from "./teacher.service.js";

export const schoolAdminRouter = Router();
export const teacherRouter = Router();

schoolAdminRouter.use(
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN")
);

teacherRouter.use(
  requireAuth,
  requireRoles("TEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN")
);

const schoolBody = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(64).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

const schoolPatch = schoolBody.partial().extend({
  isActive: z.boolean().optional(),
  code: z.string().max(64).nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: z.string().max(64).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const teacherCreate = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  staffRole: z.enum(["TEACHER", "SCHOOL_ADMIN"]).optional(),
});

const classroomBody = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(64).optional(),
  gradeLabel: z.string().max(64).optional(),
});

const classroomPatch = classroomBody.partial().extend({
  isActive: z.boolean().optional(),
  code: z.string().max(64).nullable().optional(),
  gradeLabel: z.string().max(64).nullable().optional(),
});

const idBody = z.object({ teacherUserId: z.string().min(1) });
const childBody = z.object({ childId: z.string().min(1) });
const lessonBody = z.object({ lessonId: z.string().min(1) });

schoolAdminRouter.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const isActive =
      req.query.isActive === "true"
        ? true
        : req.query.isActive === "false"
          ? false
          : undefined;
    const data = await schoolService.listSchools(req.user!, { q, isActive });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

schoolAdminRouter.post(
  "/",
  validateBody(schoolBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.createSchool(req.user!, req.body);
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

/* Static prefixes before /:schoolId */
schoolAdminRouter.patch(
  "/teachers/:userId",
  validateBody(
    z.object({
      name: z.string().min(1).max(120).optional(),
      isActive: z.boolean().optional(),
      schoolId: z.string().optional(),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.updateTeacherStaff(
        req.user!,
        String(req.params.userId),
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.get(
  "/classrooms/:classroomId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.getClassroomDetail(
        req.user!,
        String(req.params.classroomId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.patch(
  "/classrooms/:classroomId",
  validateBody(classroomPatch),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.updateClassroom(
        req.user!,
        String(req.params.classroomId),
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/classrooms/:classroomId/teachers",
  validateBody(idBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.assignTeacherToClassroom(
        req.user!,
        String(req.params.classroomId),
        req.body.teacherUserId
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.delete(
  "/classrooms/:classroomId/teachers/:teacherUserId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.unassignTeacherFromClassroom(
        req.user!,
        String(req.params.classroomId),
        String(req.params.teacherUserId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/classrooms/:classroomId/students",
  validateBody(childBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.enrollChildInClassroom(
        req.user!,
        String(req.params.classroomId),
        req.body.childId
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.delete(
  "/classrooms/:classroomId/students/:childId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.unenrollChildFromClassroom(
        req.user!,
        String(req.params.classroomId),
        String(req.params.childId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.get("/:schoolId", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await schoolService.getSchool(req.user!, String(req.params.schoolId));
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

schoolAdminRouter.patch(
  "/:schoolId",
  validateBody(schoolPatch),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.updateSchool(
        req.user!,
        String(req.params.schoolId),
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/:schoolId/deactivate",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.setSchoolActive(
        req.user!,
        String(req.params.schoolId),
        false
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/:schoolId/activate",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.setSchoolActive(
        req.user!,
        String(req.params.schoolId),
        true
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.get(
  "/:schoolId/teachers",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.listSchoolTeachers(
        req.user!,
        String(req.params.schoolId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/:schoolId/teachers",
  validateBody(teacherCreate),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.createTeacherAccount(
        req.user!,
        String(req.params.schoolId),
        req.body
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.get(
  "/:schoolId/classrooms",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const school = await schoolService.getSchool(req.user!, String(req.params.schoolId));
      res.json({ data: school.classrooms });
    } catch (e) {
      next(e);
    }
  }
);

schoolAdminRouter.post(
  "/:schoolId/classrooms",
  validateBody(classroomBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.createClassroom(
        req.user!,
        String(req.params.schoolId),
        req.body
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

/* ——— Teacher dashboard ——— */

teacherRouter.get("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await teacherService.getTeacherMe(req.user!);
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

teacherRouter.get(
  "/classrooms/:classroomId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.getClassroomDetail(
        req.user!,
        String(req.params.classroomId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

teacherRouter.get(
  "/classrooms/:classroomId/progress",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await teacherService.getClassroomProgress(
        req.user!,
        String(req.params.classroomId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

teacherRouter.get("/lessons", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await teacherService.listPublishedLessonsForTeachers(req.user!);
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

teacherRouter.post(
  "/classrooms/:classroomId/lessons",
  validateBody(lessonBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await teacherService.assignLessonToClassroom(
        req.user!,
        String(req.params.classroomId),
        req.body.lessonId
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

teacherRouter.delete(
  "/classrooms/:classroomId/lessons/:lessonId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await teacherService.unassignLessonFromClassroom(
        req.user!,
        String(req.params.classroomId),
        String(req.params.lessonId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

teacherRouter.post(
  "/classrooms/:classroomId/students",
  validateBody(childBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.enrollChildInClassroom(
        req.user!,
        String(req.params.classroomId),
        req.body.childId
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

teacherRouter.delete(
  "/classrooms/:classroomId/students/:childId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await schoolService.unenrollChildFromClassroom(
        req.user!,
        String(req.params.classroomId),
        String(req.params.childId)
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);
