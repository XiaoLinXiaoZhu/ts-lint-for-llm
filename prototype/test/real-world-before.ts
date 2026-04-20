// ==============================
// 模拟真实项目：改造前（全是坏函数）
// ==============================

import * as fs from "node:fs";

function readConfig(path: string) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

async function getUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

async function saveUser(user: any) {
  await fetch(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify(user),
  });
}

function formatUserName(user: any): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

function calculateAge(birthDate: Date): number {
  const now = new Date();
  return now.getFullYear() - birthDate.getFullYear();
}

async function processUserUpdate(id: string, data: any) {
  const user = await getUser(id);
  user.name = formatUserName(data);
  user.age = calculateAge(data.birthDate);
  await saveUser(user);
}

function generateReport(users: any[]): string {
  return users
    .map((u) => `${u.name}: ${u.age}`)
    .join("\n");
}

async function main() {
  const config = readConfig("./config.json");
  const users = await Promise.all(
    config.userIds.map((id: string) => getUser(id))
  );
  await processUserUpdate(users[0].id, { firstName: "Alice", lastName: "Smith", birthDate: new Date("1990-01-01") });
  console.log(generateReport(users));
}
