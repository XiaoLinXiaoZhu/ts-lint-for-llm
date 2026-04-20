// 好代码：能力分离 + 类型收紧
// 两个维度都好

type Role = "admin" | "editor" | "viewer";

interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  password: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
}

interface DB {
  query(sql: string, params: unknown[]): unknown[];
  execute(sql: string, params: unknown[]): void;
}

interface NotificationService {
  send(email: string): void;
}

// ── 纯函数 ──

/** @capability Fallible */
function validateEmail(email: string): string | null {
  if (!email || !email.includes("@")) return "invalid email";
  return null;
}

/** @capability Blocking */
function hashPassword_Blocking(password: string): string {
  let hash = password;
  for (let i = 0; i < 10; i++) {
    hash = hash + i.toString();
  }
  return hash;
}

// ── IO 薄层 ──

/** @capability IO */
function queryUserByEmail_IO(db: DB, email: string): unknown[] {
  return db.query("SELECT * FROM users WHERE email = ?", [email]);
}

/** @capability IO */
function insertUser_IO(db: DB, email: string, name: string, hash: string): void {
  db.execute("INSERT INTO users VALUES (?, ?, ?)", [email, name, hash]);
}

/** @capability IO */
function updateUserName_IO(db: DB, email: string, name: string): void {
  db.execute("UPDATE users SET name = ? WHERE email = ?", [name, email]);
}

/** @capability IO */
function queryAllUsers_IO(db: DB): unknown[] {
  return db.query("SELECT * FROM users", []);
}

/** @capability IO Fallible */
function sendNotification_IO_Fallible(service: NotificationService, email: string): void {
  service.send(email);
}

// ── 纯函数：过滤 ──

/** @capability */
function filterByRole(users: unknown[], role: Role): unknown[] {
  return (users as Array<{ role: string }>).filter(u => u.role === role);
}

// ── 协调层 ──

type CreateResult =
  | { outcome: "created"; email: string }
  | { outcome: "updated" }
  | { outcome: "error"; reason: string };

/** @capability IO Blocking Fallible */
function createUser_IO_Blocking_Fallible(
  input: CreateUserInput,
  db: DB,
  notification: NotificationService,
  onConflict: "update" | "reject",
): CreateResult {
  const emailErr = validateEmail(input.email);
  if (emailErr) return { outcome: "error", reason: emailErr };

  const existing = queryUserByEmail_IO(db, input.email);
  if (existing.length > 0) {
    if (onConflict === "update") {
      updateUserName_IO(db, input.email, input.name);
      return { outcome: "updated" };
    }
    return { outcome: "error", reason: "user exists" };
  }

  const hash = hashPassword_Blocking(input.password);
  insertUser_IO(db, input.email, input.name, hash);
  sendNotification_IO_Fallible(notification, input.email);
  return { outcome: "created", email: input.email };
}

/** @capability IO */
function listUsers_IO(db: DB, role: Role | null): unknown[] {
  const all = queryAllUsers_IO(db);
  if (role) return filterByRole(all, role);
  return all;
}
