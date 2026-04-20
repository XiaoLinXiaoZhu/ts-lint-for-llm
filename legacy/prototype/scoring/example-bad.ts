// ==============================
// 坏代码：优化起点
// 一个典型的"什么都做"的注册函数
// 400行级别，ABEMI 全部混在一起，深层嵌套
// ==============================

interface UserInput {
  email: string;
  password: string;
  name: string;
  age?: number;
  referralCode?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  age: number;
  passwordHash: string;
  referralBy?: string;
  createdAt: Date;
}

interface DB {
  query(sql: string, params: unknown[]): Promise<unknown[]>;
  execute(sql: string, params: unknown[]): Promise<void>;
}

interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

// ---- 全局可变状态 ----
const registrationStats = { total: 0, failed: 0, lastError: "" };

// Mutable: 修改全局状态
// IO: 数据库+邮件
// Async: await
// Blocking: bcrypt 同步哈希
// Fallible(E): 到处 throw
async function registerUser(
  input: UserInput,
  db: DB,
  emailService: EmailService,
  options: { sendWelcome?: boolean; validateReferral?: boolean } = {},
): Promise<User | null> {
  registrationStats.total++;                                        // M: 修改全局状态

  // ---- 输入校验（本应是纯函数）----
  if (!input.email) {                                               // E: 分支
    registrationStats.lastError = "email required";                 // M: 又改全局
    throw new Error("Email is required");                           // E: 抛出
  }

  if (!input.email.includes("@")) {                                 // E: 嵌套分支
    if (input.email.includes("..")) {                               // E: 更深嵌套
      registrationStats.lastError = "malformed email";
      throw new Error("Malformed email: contains ..");
    }
    registrationStats.lastError = "invalid email";
    throw new Error("Invalid email format");
  }

  if (input.email.length > 254) {
    throw new Error("Email too long");
  }

  const emailParts = input.email.split("@");
  if (emailParts.length !== 2) {
    throw new Error("Invalid email: multiple @ signs");
  }

  const [localPart, domain] = emailParts;
  if (localPart.length === 0 || domain.length === 0) {
    throw new Error("Invalid email: empty local or domain part");
  }

  if (!domain.includes(".")) {
    throw new Error("Invalid email: domain must have a dot");
  }

  if (!input.password) {
    throw new Error("Password is required");
  }

  if (input.password.length < 8) {
    throw new Error("Password too short");
  }

  if (input.password.length > 128) {
    throw new Error("Password too long");
  }

  if (!/[A-Z]/.test(input.password)) {
    throw new Error("Password must contain uppercase");
  }

  if (!/[a-z]/.test(input.password)) {
    throw new Error("Password must contain lowercase");
  }

  if (!/[0-9]/.test(input.password)) {
    throw new Error("Password must contain a digit");
  }

  if (!input.name || input.name.trim().length === 0) {
    throw new Error("Name is required");
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length > 100) {
    throw new Error("Name too long");
  }

  let age = 0;
  if (input.age !== undefined) {                                    // 嵌套开始
    if (typeof input.age !== "number") {
      throw new Error("Age must be a number");
    }
    if (input.age < 0 || input.age > 150) {                        // 深层嵌套
      throw new Error("Invalid age");
    }
    age = Math.floor(input.age);
  }

  // ---- 检查用户是否已存在（IO + Fallible）----
  let existingUsers: unknown[];
  try {                                                             // E: try-catch
    existingUsers = await db.query(                                 // I+A: 数据库IO + 异步
      "SELECT id FROM users WHERE email = ?",
      [input.email],
    );
  } catch (err) {                                                   // E: catch分支
    registrationStats.failed++;                                     // M: 修改全局
    registrationStats.lastError = "db query failed";
    throw new Error(`Database error checking existing user: ${err}`);
  }

  if (existingUsers.length > 0) {                                   // E: 分支
    registrationStats.failed++;
    registrationStats.lastError = "duplicate email";
    throw new Error("User already exists");
  }

  // ---- 处理推荐码（IO + 条件嵌套地狱）----
  let referralById: string | undefined;
  if (options.validateReferral && input.referralCode) {             // 嵌套层1
    try {                                                           // 嵌套层2
      const referrers = await db.query(                             // I+A
        "SELECT id, referral_count FROM users WHERE referral_code = ?",
        [input.referralCode],
      );
      if (referrers.length > 0) {                                   // 嵌套层3
        const referrer = referrers[0] as { id: string; referral_count: number };
        if (referrer.referral_count < 10) {                         // 嵌套层4!
          referralById = referrer.id;
          try {                                                     // 嵌套层5!!
            await db.execute(                                       // I+A+M
              "UPDATE users SET referral_count = referral_count + 1 WHERE id = ?",
              [referrer.id],
            );
          } catch (updateErr) {                                     // 嵌套层5 catch
            // 静默忽略推荐计数更新失败
            console.error("Failed to update referral count:", updateErr);
          }
        } else {
          console.warn("Referrer has reached max referrals");
        }
      } else {
        if (input.referralCode.startsWith("PROMO_")) {             // 嵌套层3 另一个分支
          // 特殊促销码，不需要引荐人
          referralById = "PROMO";
        } else {
          throw new Error("Invalid referral code");
        }
      }
    } catch (err) {
      if ((err as Error).message === "Invalid referral code") {
        throw err;
      }
      registrationStats.lastError = "referral check failed";
      // 推荐码校验失败不阻塞注册
      console.error("Referral validation error:", err);
    }
  }

  // ---- 密码哈希（同步阻塞）----
  let passwordHash: string;
  try {
    // 模拟 bcrypt 同步哈希（阻塞操作）
    const rounds = 12;
    let hash = input.password;
    for (let i = 0; i < rounds; i++) {                              // B: 阻塞循环
      hash = hash.split("").reverse().join("") + i.toString(36);   // 模拟计算密集
    }
    passwordHash = `bcrypt:${hash}`;
  } catch (err) {
    registrationStats.failed++;
    registrationStats.lastError = "hash failed";
    throw new Error(`Password hashing failed: ${err}`);
  }

  // ---- 创建用户（IO + Mutable）----
  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  try {
    await db.execute(                                               // I+A: 数据库写入
      "INSERT INTO users (id, email, name, age, password_hash, referral_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [userId, input.email, trimmedName, age, passwordHash, referralById ?? null, now.toISOString()],
    );
  } catch (err) {
    registrationStats.failed++;
    registrationStats.lastError = "insert failed";
    throw new Error(`Failed to create user: ${err}`);
  }

  // ---- 发送欢迎邮件（IO + Async + 条件）----
  if (options.sendWelcome !== false) {                              // 默认发送
    const subject = referralById
      ? "Welcome! Thanks for the referral"
      : "Welcome to our platform";

    let body = `Hello ${trimmedName},\n\nWelcome!`;
    if (referralById && referralById !== "PROMO") {
      body += `\nYou were referred by a friend.`;
    } else if (referralById === "PROMO") {
      body += `\nYou joined with a promotional code.`;
    }

    if (age > 0) {
      if (age < 18) {
        body += `\nPlease ask a parent to verify your account.`;
      } else if (age >= 65) {
        body += `\nAs a senior member, you get extra benefits!`;
      }
    }

    body += `\n\nBest regards,\nThe Team`;

    try {
      await emailService.send(input.email, subject, body);         // I+A: 邮件IO
    } catch (emailErr) {
      // 邮件发送失败不阻塞注册
      console.error("Welcome email failed:", emailErr);
    }
  }

  // ---- 构建返回对象 ----
  const user: User = {
    id: userId,
    email: input.email,
    name: trimmedName,
    age,
    passwordHash,
    referralBy: referralById,
    createdAt: now,
  };

  return user;
}
