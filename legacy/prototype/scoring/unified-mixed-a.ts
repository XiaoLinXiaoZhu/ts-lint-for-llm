// 混合 A：能力分离了，但类型仍然松散
// 能力负担低，松散度高
// 验证两个维度的独立性

// ── 纯函数 ──

/** @capability Fallible */
function validateEmail(email: any): any {
  if (!email || !email.includes("@")) return "invalid";
  return null;
}

/** @capability Blocking */
function hashPassword_Blocking(password: any): any {
  let hash = password;
  for (let i = 0; i < 10; i++) {
    hash = hash + i.toString();
  }
  return hash;
}

// ── IO 薄层 ──

/** @capability IO */
function queryUser_IO(db: any, email: any): any {
  return db.query("SELECT * FROM users WHERE email = ?", [email]);
}

/** @capability IO */
function insertUser_IO(db: any, email: any, name: any, hash: any): any {
  db.execute("INSERT INTO users VALUES (?, ?, ?)", [email, name, hash]);
}

/** @capability IO */
function updateUser_IO(db: any, email: any, name: any): any {
  db.execute("UPDATE users SET name = ? WHERE email = ?", [name, email]);
}

/** @capability IO */
function queryAll_IO(db: any): any {
  return db.query("SELECT * FROM users", []);
}

/** @capability IO Fallible */
function notify_IO_Fallible(service: any, email: any): any {
  service.send(email);
}

/** @capability */
function filterByRole(users: any, role: any): any {
  return users.filter((u: any) => u.role === role);
}

// ── 协调层 ──

/** @capability IO Blocking Fallible */
function createUser_IO_Blocking_Fallible(
  input: any,
  db: any,
  notification: any,
  onConflict: boolean,
): any {
  const emailErr = validateEmail(input.email);
  if (emailErr) return { error: emailErr };

  const existing = queryUser_IO(db, input.email);
  if (existing.length > 0) {
    if (onConflict) {
      updateUser_IO(db, input.email, input.name);
      return { updated: true };
    }
    return { error: "exists" };
  }

  const hash = hashPassword_Blocking(input.password);
  insertUser_IO(db, input.email, input.name, hash);
  notify_IO_Fallible(notification, input.email);
  return { created: true, email: input.email };
}

/** @capability IO */
function listUsers_IO(db: any, role: any): any {
  const all = queryAll_IO(db);
  if (role) return filterByRole(all, role);
  return all;
}
