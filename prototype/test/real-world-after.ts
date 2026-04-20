// ==============================
// 模拟真实项目：改造后（逐步标注）
// ==============================

import { readFileSync_IO_Blocking_Fallible } from "../adapters/node-fs.js";

// ---- 纯函数：显式标注 ----

/** @capability */
function formatUserName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** @capability */
function calculateAge(birthDate: Date): number {
  const now = new Date();
  return now.getFullYear() - birthDate.getFullYear();
}

/** @capability */
function generateReport(users: Array<{ name: string; age: number }>): string {
  return users
    .map((u) => `${u.name}: ${u.age}`)
    .join("\n");
}

// ---- IO 函数：命名后缀声明 ----

function readConfig_IO_Blocking_Fallible(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync_IO_Blocking_Fallible(path, "utf8") as string);
}

async function getUser_IO_Async_Fallible(id: string): Promise<{ id: string; name: string; age: number }> {
  const response = await fetch(`/api/users/${id}`);
  return response.json() as any;
}

async function saveUser_IO_Async_Fallible(user: { id: string; name: string; age: number }): Promise<void> {
  await fetch(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(user),
  });
}

async function processUserUpdate_IO_Async_Fallible(
  id: string,
  data: { firstName: string; lastName: string; birthDate: Date },
): Promise<void> {
  const user = await getUser_IO_Async_Fallible(id);
  user.name = formatUserName(data);
  user.age = calculateAge(data.birthDate);
  await saveUser_IO_Async_Fallible(user);
}

async function main_IO_Async_Blocking_Fallible(): Promise<void> {
  const config = readConfig_IO_Blocking_Fallible("./config.json") as { userIds: string[] };
  const users = await Promise.all(
    config.userIds.map((id: string) => getUser_IO_Async_Fallible(id))
  );
  await processUserUpdate_IO_Async_Fallible(
    users[0].id,
    { firstName: "Alice", lastName: "Smith", birthDate: new Date("1990-01-01") },
  );
  console.log(generateReport(users));
}
