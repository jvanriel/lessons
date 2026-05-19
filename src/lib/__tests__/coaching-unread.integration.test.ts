/**
 * Integration tests for the coaching-chat unread badge query
 * (task 144). Hits the preview Postgres directly because the bug
 * we're locking down was specifically in how Drizzle's correlated
 * subquery resolved unqualified column names — a pure unit test
 * against a mocked DB wouldn't have caught it.
 *
 * What the bug was: `${proStudents.id}` inside the subquery rendered
 * as a bare `"id"`, which Postgres bound to `comments.id` instead of
 * `pro_students.id`. The join condition collapsed to
 * `comments.context_id = comments.id` — never true — so the unread
 * count was silently 0 for every conversation since the badge
 * shipped. This test re-runs the live query against real rows and
 * asserts the count comes back >0 when a comment is genuinely
 * unread, locking in the table-aliased SQL we shipped in v1.1.95.
 *
 * Run: pnpm vitest run src/lib/__tests__/coaching-unread.integration.test.ts
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
} from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and, inArray } from "drizzle-orm";
import {
  users,
  proProfiles,
  proStudents,
  comments,
} from "@/lib/db/schema";
import {
  getCoachingUnreadCountsForStudent,
  getCoachingUnreadCountsForPro,
  markCoachingRead,
} from "@/lib/coaching-unread";

const PRO_EMAIL = process.env.DUMMY_PRO || "dummy-pro-claude@golflessons.be";
const STUDENT_EMAIL =
  process.env.DUMMY_STUDENT || "dummy-student-claude@golflessons.be";

const dbUrl = process.env.POSTGRES_URL_PREVIEW || process.env.POSTGRES_URL!;
const db = drizzle(neon(dbUrl));

let proProfileId: number;
let proUserId: number;
let studentUserId: number;
let proStudentId: number;
const createdCommentIds: number[] = [];

beforeAll(async () => {
  if (!dbUrl) {
    throw new Error(
      "coaching-unread integration: POSTGRES_URL_PREVIEW or POSTGRES_URL must be set",
    );
  }

  const [proUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PRO_EMAIL))
    .limit(1);
  if (!proUser) throw new Error(`Pro account ${PRO_EMAIL} not seeded`);
  proUserId = proUser.id;

  const [profile] = await db
    .select({ id: proProfiles.id })
    .from(proProfiles)
    .where(eq(proProfiles.userId, proUserId))
    .limit(1);
  if (!profile) throw new Error("Pro profile not found");
  proProfileId = profile.id;

  // Make sure the student exists.
  const [studentRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, STUDENT_EMAIL))
    .limit(1);
  if (studentRow) {
    studentUserId = studentRow.id;
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        firstName: "Dummy",
        lastName: "Student",
        email: STUDENT_EMAIL,
        roles: "member",
      })
      .returning({ id: users.id });
    studentUserId = inserted.id;
  }

  // Ensure an ACTIVE pro_students row links the two. The unread query
  // filters status='active' so an inactive row would silently zero
  // the result.
  const [existingRel] = await db
    .select({ id: proStudents.id, status: proStudents.status })
    .from(proStudents)
    .where(
      and(
        eq(proStudents.proProfileId, proProfileId),
        eq(proStudents.userId, studentUserId),
      ),
    )
    .limit(1);
  if (existingRel) {
    proStudentId = existingRel.id;
    if (existingRel.status !== "active") {
      await db
        .update(proStudents)
        .set({ status: "active" })
        .where(eq(proStudents.id, proStudentId));
    }
  } else {
    const [inserted] = await db
      .insert(proStudents)
      .values({
        proProfileId,
        userId: studentUserId,
        source: "self",
        status: "active",
      })
      .returning({ id: proStudents.id });
    proStudentId = inserted.id;
  }

  // Start each run with both sides considered up-to-date so the
  // existing fixture's chat history doesn't pollute the assertions.
  await db
    .update(proStudents)
    .set({ studentLastSeenAt: new Date(), proLastSeenAt: new Date() })
    .where(eq(proStudents.id, proStudentId));
});

afterEach(async () => {
  if (createdCommentIds.length > 0) {
    await db
      .delete(comments)
      .where(inArray(comments.id, createdCommentIds));
    createdCommentIds.length = 0;
  }
  // Reset both last-seen timestamps to "now" so each test starts
  // from a clean slate.
  await db
    .update(proStudents)
    .set({ studentLastSeenAt: new Date(), proLastSeenAt: new Date() })
    .where(eq(proStudents.id, proStudentId));
});

afterAll(async () => {
  // Belt + braces — drop anything we left behind from a failed run.
  await db
    .delete(comments)
    .where(
      and(
        eq(comments.contextType, "coaching"),
        eq(comments.contextId, proStudentId),
        inArray(comments.authorId, [proUserId, studentUserId]),
      ),
    );
});

async function postComment(authorId: number): Promise<number> {
  const [row] = await db
    .insert(comments)
    .values({
      contextType: "coaching",
      contextId: proStudentId,
      authorId,
      content: `test ${Date.now()}`,
      type: "comment",
    })
    .returning({ id: comments.id });
  createdCommentIds.push(row.id);
  return row.id;
}

describe("getCoachingUnreadCountsForStudent", () => {
  it("returns 1 when the pro sends a message the student hasn't read", async () => {
    // Pro posts a fresh message AFTER the student's last_seen_at.
    await new Promise((r) => setTimeout(r, 20));
    await postComment(proUserId);
    const counts = await getCoachingUnreadCountsForStudent(studentUserId);
    expect(counts.byProStudentId.get(proStudentId)).toBe(1);
    expect(counts.total).toBe(1);
  });

  it("returns 0 when the only message was authored by the student", async () => {
    await postComment(studentUserId);
    const counts = await getCoachingUnreadCountsForStudent(studentUserId);
    expect(counts.byProStudentId.get(proStudentId) ?? 0).toBe(0);
    expect(counts.total).toBe(0);
  });

  it("returns 0 after markCoachingRead bumps studentLastSeenAt", async () => {
    await new Promise((r) => setTimeout(r, 20));
    await postComment(proUserId);
    // Postgres NOW() and JS Date() can drift by a few ms on the
    // Neon serverless link — give the mark-read clock enough slack
    // to land strictly after the comment.created_at.
    await new Promise((r) => setTimeout(r, 150));
    await markCoachingRead(proStudentId, "student");
    const counts = await getCoachingUnreadCountsForStudent(studentUserId);
    expect(counts.total).toBe(0);
  });

  it("sums multiple unread comments from the pro", async () => {
    await new Promise((r) => setTimeout(r, 20));
    await postComment(proUserId);
    await postComment(proUserId);
    await postComment(proUserId);
    const counts = await getCoachingUnreadCountsForStudent(studentUserId);
    expect(counts.byProStudentId.get(proStudentId)).toBe(3);
    expect(counts.total).toBe(3);
  });
});

describe("getCoachingUnreadCountsForPro", () => {
  it("returns 1 when the student sends a message the pro hasn't read", async () => {
    await new Promise((r) => setTimeout(r, 20));
    await postComment(studentUserId);
    const counts = await getCoachingUnreadCountsForPro(proUserId);
    expect(counts.byProStudentId.get(proStudentId)).toBe(1);
    expect(counts.total).toBe(1);
  });

  it("returns 0 when the only message was authored by the pro", async () => {
    await postComment(proUserId);
    const counts = await getCoachingUnreadCountsForPro(proUserId);
    expect(counts.byProStudentId.get(proStudentId) ?? 0).toBe(0);
    expect(counts.total).toBe(0);
  });

  it("returns 0 after markCoachingRead bumps proLastSeenAt", async () => {
    await new Promise((r) => setTimeout(r, 20));
    await postComment(studentUserId);
    await new Promise((r) => setTimeout(r, 150));
    await markCoachingRead(proStudentId, "pro");
    const counts = await getCoachingUnreadCountsForPro(proUserId);
    expect(counts.total).toBe(0);
  });
});
