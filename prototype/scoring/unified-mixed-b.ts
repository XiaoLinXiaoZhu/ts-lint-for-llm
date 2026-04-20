// 混合 B：类型紧凑，但能力没有分离
// 能力负担高，松散度低
// 验证两个维度的独立性

type Role = "admin" | "editor" | "viewer";

interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  password: string;
}

interface User {
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

type CreateResult =
  | { outcome: "created"; email: string }
  | { outcome: "updated" }
  | { outcome: "error"; reason: string };

type OnConflict = "update" | "reject";

// 类型完美，但全部逻辑塞在一个未声明的巨函数里
function handleUser(
  action: "create" | "list",
  input: CreateUserInput,
  db: DB,
  notification: NotificationService,
  onConflict: OnConflict,
  filterRole: Role | null,
): CreateResult | unknown[] {
  if (action === "create") {
    if (!input.email || !input.email.includes("@")) {
      return { outcome: "error", reason: "invalid email" } as CreateResult;
    }

    const existing = db.query("SELECT * FROM users WHERE email = ?", [input.email]);
    if (existing.length > 0) {
      if (onConflict === "update") {
        db.execute("UPDATE users SET name = ? WHERE email = ?", [input.name, input.email]);
        return { outcome: "updated" } as CreateResult;
      }
      return { outcome: "error", reason: "user exists" } as CreateResult;
    }

    let hash = input.password;
    for (let i = 0; i < 10; i++) {
      hash = hash + i.toString();
    }

    db.execute("INSERT INTO users VALUES (?, ?, ?)", [input.email, input.name, hash]);

    try {
      notification.send(input.email);
    } catch (e) {
      console.error(e);
    }

    return { outcome: "created", email: input.email } as CreateResult;
  } else {
    const users = db.query("SELECT * FROM users", []);
    if (filterRole) {
      return (users as Array<{ role: string }>).filter(u => u.role === filterRole);
    }
    return users;
  }
}
