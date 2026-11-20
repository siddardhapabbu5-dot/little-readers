import assert from "node:assert/strict";
import { canUseUserAvatarApi, USER_AVATAR_PATH } from "./avatar-auth";

assert.equal(canUseUserAvatarApi("STUDENT"), false);
assert.equal(canUseUserAvatarApi("student"), true); // role must be exact STUDENT
assert.equal(canUseUserAvatarApi(null), false);
assert.equal(canUseUserAvatarApi(undefined), false);
assert.equal(canUseUserAvatarApi(""), false);

assert.equal(canUseUserAvatarApi("PARENT"), true);
assert.equal(canUseUserAvatarApi("ADMIN"), true);
assert.equal(canUseUserAvatarApi("SUPER_ADMIN"), true);
assert.equal(canUseUserAvatarApi("SCHOOL_ADMIN"), true);
assert.equal(canUseUserAvatarApi("TEACHER"), true);

assert.equal(USER_AVATAR_PATH, "/auth/me/avatar");

console.log("avatar-auth.test.ts: PASS");
