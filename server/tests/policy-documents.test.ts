import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { PolicyDocument } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

const pdf = (label: string) =>
  Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n`, "latin1");

describe.skipIf(!hasDb)("Admin policy documents (PDF upload/view/edit/replace/download/delete)", () => {
  const unique = Date.now();
  const parentEmail = `policy_docs_parent_${unique}@example.com`;
  let adminToken = "";
  let parentToken = "";
  let snapshot: PolicyDocument[] = [];
  const base = "/api/admin/privacy/documents";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
    snapshot = await prisma.policyDocument.findMany();
    await prisma.policyDocument.deleteMany({});

    const adminHash = await hashPassword("AdminDemo1");
    await prisma.user.upsert({
      where: { email: "admin@littlereaders.test" },
      update: { passwordHash: adminHash, role: "ADMIN", isActive: true },
      create: {
        name: "Demo Admin",
        email: "admin@littlereaders.test",
        passwordHash: adminHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    await prisma.user.create({
      data: {
        name: "Policy Docs Parent",
        email: parentEmail,
        passwordHash: await hashPassword("SecurePass1"),
        role: "PARENT",
        isActive: true,
      },
    });
    const parentLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: parentEmail, password: "SecurePass1" });
    expect(parentLogin.status).toBe(200);
    parentToken = parentLogin.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: parentEmail } });
    await prisma.policyDocument.deleteMany({});
    if (snapshot.length) await prisma.policyDocument.createMany({ data: snapshot });
  });

  const admin = (r: request.Test) => r.set("Authorization", `Bearer ${adminToken}`);
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

  it("lists the four default documents as Not Uploaded", async () => {
    const res = await admin(request(app).get(base));
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { title: string }) => d.title)).toEqual([
      "LEARN WISE Privacy Policy",
      "LEARN WISE Terms of Service",
      "LEARN WISE Parental Consent",
      "LEARN WISE Subscription & Refund Policy",
    ]);
    expect(res.body.data.every((d: { uploaded: boolean }) => !d.uploaded)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("fileData");
  });

  it("uploads a PDF, then views it inline", async () => {
    const up = await admin(request(app).post(`${base}/privacy-policy/file`)).attach(
      "file",
      pdf("first"),
      { filename: "Official Privacy.pdf", contentType: "application/pdf" }
    );
    expect(up.status).toBe(201);
    expect(up.body.data.uploaded).toBe(true);
    expect(up.body.data.fileName).toBe("Official Privacy.pdf");
    expect(up.body.data.fileSize).toBe(pdf("first").length);

    const view = await binary(admin(request(app).get(`${base}/privacy-policy/file`)));
    expect(view.status).toBe(200);
    expect(view.headers["content-type"]).toContain("application/pdf");
    expect(view.headers["content-disposition"]).toContain("inline");
    expect(Buffer.from(view.body).toString("latin1")).toContain("first");
  });

  it("edits document details", async () => {
    const res = await admin(request(app).patch(`${base}/privacy-policy`)).send({
      title: "LEARN WISE Privacy Policy (2026)",
      description: "Official policy",
      version: "2.0",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: "LEARN WISE Privacy Policy (2026)",
      description: "Official policy",
      version: "2.0",
      uploaded: true,
    });
  });

  it("rejects non-PDF and keeps the existing PDF", async () => {
    const bad = await admin(request(app).post(`${base}/privacy-policy/file`)).attach(
      "file",
      Buffer.from("not a pdf at all"),
      { filename: "fake.pdf", contentType: "application/pdf" }
    );
    expect(bad.status).toBe(400);
    const wrongExt = await admin(request(app).post(`${base}/privacy-policy/file`)).attach(
      "file",
      pdf("x"),
      { filename: "policy.docx", contentType: "application/pdf" }
    );
    expect(wrongExt.status).toBe(400);

    const view = await binary(admin(request(app).get(`${base}/privacy-policy/file`)));
    expect(Buffer.from(view.body).toString("latin1")).toContain("first");
  });

  it("replaces the PDF and downloads it with a clean filename", async () => {
    const up = await admin(request(app).post(`${base}/privacy-policy/file`)).attach(
      "file",
      pdf("second"),
      { filename: "v2.pdf", contentType: "application/pdf" }
    );
    expect(up.status).toBe(201);
    expect(up.body.data.fileName).toBe("v2.pdf");

    const dl = await binary(admin(request(app).get(`${base}/privacy-policy/file?download=1`)));
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toBe(
      'attachment; filename="LEARN_WISE_Privacy_Policy.pdf"'
    );
    expect(Buffer.from(dl.body).toString("latin1")).toContain("second");
  });

  it("opens through a short-lived signed link and rejects a tampered one", async () => {
    const link = await admin(request(app).post(`${base}/privacy-policy/link`));
    expect(link.status).toBe(200);
    const ok = await binary(request(app).get(`/api${link.body.data.path}`));
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toContain("application/pdf");

    const tampered = link.body.data.path.replace("privacy-policy", "parental-consent");
    expect((await request(app).get(`/api${tampered}`)).status).toBe(401);
  });

  it("deletes the PDF and the card returns to Not Uploaded", async () => {
    const del = await admin(request(app).delete(`${base}/privacy-policy/file`));
    expect(del.status).toBe(200);
    expect(del.body.data.uploaded).toBe(false);
    expect((await binary(admin(request(app).get(`${base}/privacy-policy/file`)))).status).toBe(404);
  });

  it("refuses parents and anonymous users on every action", async () => {
    const asParent = (r: request.Test) => r.set("Authorization", `Bearer ${parentToken}`);
    const calls = [
      () => request(app).get(base),
      () => request(app).patch(`${base}/privacy-policy`).send({ title: "x" }),
      () =>
        request(app)
          .post(`${base}/privacy-policy/file`)
          .attach("file", pdf("evil"), { filename: "e.pdf", contentType: "application/pdf" }),
      () => request(app).get(`${base}/privacy-policy/file?download=1`),
      () => request(app).post(`${base}/privacy-policy/link`),
      () => request(app).delete(`${base}/privacy-policy/file`),
    ];
    for (const call of calls) {
      expect((await call()).status).toBe(401);
      expect((await asParent(call())).status).toBe(403);
    }
  });
});
