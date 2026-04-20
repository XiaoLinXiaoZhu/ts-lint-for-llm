// ==============================
// 好代码：优化目标
// 同样的业务逻辑，按能力边界拆分
// ==============================

// ---- 类型定义 ----

interface UserInput {
  email: string;
  password: string;
  name: string;
  age?: number;
  referralCode?: string;
}

// Parse don't validate: 校验通过后得到窄类型，消除下游的 E
interface ValidatedInput {
  email: string;       // 已验证格式
  password: string;    // 已验证强度
  name: string;        // 已 trim 且验证长度
  age: number;         // 已验证范围，默认 0
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

// ---- 纯函数：输入校验 (Parse don't validate → 消除 E) ----
// 返回 ValidatedInput 或 string(错误消息)
// 注意：这里的"Fallible"通过返回值表达而非 throw，
// 调用方拿到 ValidatedInput 后不再需要处理 E

/** @capability Fallible */
function validateUserInput(input: UserInput): ValidatedInput | string {
  if (!input.email || !input.email.includes("@")) {
    return "Invalid email format";
  }

  if (input.email.length > 254) return "Email too long";

  const [localPart, domain] = input.email.split("@");
  if (!localPart || !domain || !domain.includes(".")) {
    return "Invalid email structure";
  }

  if (!input.password || input.password.length < 8 || input.password.length > 128) {
    return "Password must be 8-128 characters";
  }

  if (!/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/[0-9]/.test(input.password)) {
    return "Password must contain upper, lower, and digit";
  }

  const name = input.name?.trim();
  if (!name || name.length > 100) {
    return "Name is required and must be ≤ 100 chars";
  }

  let age = 0;
  if (input.age !== undefined) {
    if (typeof input.age !== "number" || input.age < 0 || input.age > 150) {
      return "Invalid age";
    }
    age = Math.floor(input.age);
  }

  return { email: input.email, password: input.password, name, age, referralCode: input.referralCode };
}


// ---- 纯函数：密码哈希（Blocking，但无 IO/E/M）----

/** @capability Blocking */
function hashPassword_Blocking(password: string): string {
  const rounds = 12;
  let hash = password;
  for (let i = 0; i < rounds; i++) {
    hash = hash.split("").reverse().join("") + i.toString(36);
  }
  return `bcrypt:${hash}`;
}


// ---- 纯函数：构建欢迎邮件内容 ----

/** @capability */
function buildWelcomeEmail(name: string, age: number, referralBy?: string): { subject: string; body: string } {
  const subject = referralBy
    ? "Welcome! Thanks for the referral"
    : "Welcome to our platform";

  let body = `Hello ${name},\n\nWelcome!`;

  if (referralBy && referralBy !== "PROMO") {
    body += `\nYou were referred by a friend.`;
  } else if (referralBy === "PROMO") {
    body += `\nYou joined with a promotional code.`;
  }

  if (age > 0 && age < 18) {
    body += `\nPlease ask a parent to verify your account.`;
  } else if (age >= 65) {
    body += `\nAs a senior member, you get extra benefits!`;
  }

  body += `\n\nBest regards,\nThe Team`;
  return { subject, body };
}


// ---- IO 函数：数据库操作（隔离 IO + Async + Fallible）----

async function checkUserExists_IO_Async_Fallible(db: DB, email: string): Promise<boolean> {
  const rows = await db.query("SELECT id FROM users WHERE email = ?", [email]);
  return rows.length > 0;
}

async function resolveReferral_IO_Async_Fallible(
  db: DB,
  code: string,
): Promise<string | null> {
  const referrers = await db.query(
    "SELECT id, referral_count FROM users WHERE referral_code = ?",
    [code],
  );

  if (referrers.length === 0) {
    return code.startsWith("PROMO_") ? "PROMO" : null;
  }

  const referrer = referrers[0] as { id: string; referral_count: number };
  if (referrer.referral_count >= 10) return null;

  await db.execute(
    "UPDATE users SET referral_count = referral_count + 1 WHERE id = ?",
    [referrer.id],
  );
  return referrer.id;
}

async function insertUser_IO_Async_Fallible(
  db: DB,
  input: ValidatedInput,
  passwordHash: string,
  referralBy: string | undefined,
): Promise<User> {
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const now = new Date();

  await db.execute(
    "INSERT INTO users (id, email, name, age, password_hash, referral_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, input.email, input.name, input.age, passwordHash, referralBy ?? null, now.toISOString()],
  );

  return { id, email: input.email, name: input.name, age: input.age, passwordHash, referralBy, createdAt: now };
}

async function sendEmail_IO_Async(
  service: EmailService,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  await service.send(to, subject, body);
}


// ---- 协调层：组合各模块 ----

/** @capability IO Async Fallible */
async function registerUser_IO_Async_Fallible(
  input: UserInput,
  db: DB,
  emailService: EmailService,
  options: { sendWelcome?: boolean; validateReferral?: boolean } = {},
): Promise<User | string> {
  // 1. Parse don't validate — 之后所有代码都不需要处理输入校验的 E
  const validated = validateUserInput(input);
  if (typeof validated === "string") return validated;

  // 2. 检查重复
  if (await checkUserExists_IO_Async_Fallible(db, validated.email)) {
    return "User already exists";
  }

  // 3. 推荐码（可选）
  let referralBy: string | undefined;
  if (options.validateReferral && validated.referralCode) {
    referralBy = (await resolveReferral_IO_Async_Fallible(db, validated.referralCode)) ?? undefined;
  }

  // 4. 哈希密码（纯计算）
  const hash = hashPassword_Blocking(validated.password);

  // 5. 写入数据库
  const user = await insertUser_IO_Async_Fallible(db, validated, hash, referralBy);

  // 6. 发送欢迎邮件（失败不阻塞）
  if (options.sendWelcome !== false) {
    const email = buildWelcomeEmail(validated.name, validated.age, referralBy);
    await sendEmail_IO_Async(emailService, validated.email, email.subject, email.body).catch(() => {});
  }

  return user;
}
