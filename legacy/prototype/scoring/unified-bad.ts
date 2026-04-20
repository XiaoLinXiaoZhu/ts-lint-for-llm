// 坏代码：能力混合 + 类型松散
// 两个维度都差

interface UserData {
  name?: string;
  email?: string;
  role?: string;
  age?: number;
  avatar?: string;
}

function handleUser(
  action: boolean,
  data: any,
  db: any,
  options: Record<string, any>,
): any {
  if (action) {
    if (data.email) {
      if (!data.email.includes("@")) {
        throw new Error("bad email");
      }
      const existing = db.query("SELECT * FROM users WHERE email = ?", [data.email]);
      if (existing.length > 0) {
        if (options.update) {
          db.execute("UPDATE users SET name = ? WHERE email = ?", [data.name, data.email]);
          return { updated: true };
        }
        throw new Error("exists");
      }
    }

    let hash = data.password;
    for (let i = 0; i < 10; i++) {
      hash = hash + i.toString();
    }

    db.execute("INSERT INTO users VALUES (?, ?, ?)", [data.email, data.name, hash]);

    if (options.notify) {
      try {
        db.execute("INSERT INTO notifications VALUES (?)", [data.email]);
      } catch (e) {
        console.error(e);
      }
    }

    return { created: true, email: data.email };
  } else {
    const users = db.query("SELECT * FROM users");
    if (options.role) {
      return users.filter((u: any) => u.role === options.role);
    }
    return users;
  }
}
