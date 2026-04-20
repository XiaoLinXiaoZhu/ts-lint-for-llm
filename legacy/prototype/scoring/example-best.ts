// ==============================
// 最优代码：进一步优化目标
// 在 good 基础上：
//   1. 校验拆细 → 每个子校验器 CC 低、嵌套浅
//   2. resolveReferral 拆出纯业务逻辑
//   3. 协调层尽可能薄，E 在边界吸收
//   4. 邮件构建也拆细
// ==============================

// ---- 类型定义 ----

interface UserInput {
  email: string;
  password: string;
  name: string;
  age?: number;
  referralCode?: string;
}

interface ValidatedInput {
  email: string;
  password: string;
  name: string;
  age: number;
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

interface Referrer {
  id: string;
  referral_count: number;
}

interface DB {
  query(sql: string, params: unknown[]): Promise<unknown[]>;
  execute(sql: string, params: unknown[]): Promise<void>;
}

interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

// ---- 纯函数：校验器拆细（每个 CC 极低）----

/** @capability Fallible */
function validateEmail(email: string): string | null {
  if (!email || !email.includes("@")) return "Invalid email format";
  if (email.length > 254) return "Email too long";
  const [local, domain] = email.split("@");
  if (!local || !domain || !domain.includes(".")) return "Invalid email structure";
  return null;
}

/** @capability Fallible */
function validatePassword(password: string): string | null {
  if (!password || password.length < 8 || password.length > 128) return "Password must be 8-128 characters";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain upper, lower, and digit";
  }
  return null;
}

/** @capability Fallible */
function validateName(name: string | undefined): string | null {
  if (!name || !name.trim() || name.trim().length > 100) return "Name is required and must be ≤ 100 chars";
  return null;
}

/** @capability Fallible */
function validateAge(age: number | undefined): number {
  if (age === undefined) return 0;
  if (typeof age !== "number" || age < 0 || age > 150) return -1;
  return Math.floor(age);
}

/** @capability Fallible */
function validateUserInput(input: UserInput): ValidatedInput | string {
  const emailErr = validateEmail(input.email);
  if (emailErr) return emailErr;
  const passErr = validatePassword(input.password);
  if (passErr) return passErr;
  const nameErr = validateName(input.name);
  if (nameErr) return nameErr;
  const age = validateAge(input.age);
  if (age < 0) return "Invalid age";
  return { email: input.email, password: input.password, name: input.name.trim(), age, referralCode: input.referralCode };
}

// ---- 纯函数：密码哈希 ----

/** @capability Blocking */
function hashPassword_Blocking(password: string): string {
  const rounds = 12;
  let hash = password;
  for (let i = 0; i < rounds; i++) {
    hash = hash.split("").reverse().join("") + i.toString(36);
  }
  return `bcrypt:${hash}`;
}

// ---- 纯函数：推荐码业务逻辑（从 IO 中拆出）----

/** @capability */
function canAcceptReferral(referrer: Referrer): boolean {
  return referrer.referral_count < 10;
}

/** @capability */
function resolvePromoCode(code: string): string | null {
  return code.startsWith("PROMO_") ? "PROMO" : null;
}

// ---- 纯函数：邮件内容 ----

/** @capability */
function emailSubject(referralBy?: string): string {
  return referralBy ? "Welcome! Thanks for the referral" : "Welcome to our platform";
}

/** @capability */
function emailBody(name: string, age: number, referralBy?: string): string {
  let body = `Hello ${name},\n\nWelcome!`;
  if (referralBy && referralBy !== "PROMO") body += `\nYou were referred by a friend.`;
  else if (referralBy === "PROMO") body += `\nYou joined with a promotional code.`;
  if (age > 0 && age < 18) body += `\nPlease ask a parent to verify your account.`;
  else if (age >= 65) body += `\nAs a senior member, you get extra benefits!`;
  body += `\n\nBest regards,\nThe Team`;
  return body;
}

// ---- 纯函数：ID 生成 ----

/** @capability Impure */
function generateUserId_Impure(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ---- IO 层：尽可能薄，只做数据进出 ----

async function queryUserByEmail_IO_Async(db: DB, email: string): Promise<unknown[]> {
  return db.query("SELECT id FROM users WHERE email = ?", [email]);
}

async function queryReferrer_IO_Async(db: DB, code: string): Promise<Referrer | null> {
  const rows = await db.query("SELECT id, referral_count FROM users WHERE referral_code = ?", [code]);
  return rows.length > 0 ? (rows[0] as Referrer) : null;
}

async function incrementReferralCount_IO_Async(db: DB, referrerId: string): Promise<void> {
  await db.execute("UPDATE users SET referral_count = referral_count + 1 WHERE id = ?", [referrerId]);
}

async function insertUser_IO_Async(
  db: DB, id: string, input: ValidatedInput, passwordHash: string, referralBy: string | undefined,
): Promise<User> {
  const now = new Date();
  await db.execute(
    "INSERT INTO users (id, email, name, age, password_hash, referral_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, input.email, input.name, input.age, passwordHash, referralBy ?? null, now.toISOString()],
  );
  return { id, email: input.email, name: input.name, age: input.age, passwordHash, referralBy, createdAt: now };
}

async function sendEmail_IO_Async(service: EmailService, to: string, subject: string, body: string): Promise<void> {
  await service.send(to, subject, body);
}

// ---- 协调层：薄胶水，E 在此吸收 ----

/** @capability IO Async Fallible */
async function resolveReferral_IO_Async_Fallible(db: DB, code: string): Promise<string | undefined> {
  const referrer = await queryReferrer_IO_Async(db, code);
  if (!referrer) return resolvePromoCode(code) ?? undefined;
  if (!canAcceptReferral(referrer)) return undefined;
  await incrementReferralCount_IO_Async(db, referrer.id);
  return referrer.id;
}

/** @capability IO Async Fallible */
async function registerUser_IO_Async_Fallible(
  input: UserInput,
  db: DB,
  emailService: EmailService,
  options: { sendWelcome?: boolean; validateReferral?: boolean } = {},
): Promise<User | string> {
  const validated = validateUserInput(input);
  if (typeof validated === "string") return validated;

  const existing = await queryUserByEmail_IO_Async(db, validated.email);
  if (existing.length > 0) return "User already exists";

  let referralBy: string | undefined;
  if (options.validateReferral && validated.referralCode) {
    referralBy = await resolveReferral_IO_Async_Fallible(db, validated.referralCode);
  }

  const id = generateUserId_Impure();
  const hash = hashPassword_Blocking(validated.password);
  const user = await insertUser_IO_Async(db, id, validated, hash, referralBy);

  if (options.sendWelcome !== false) {
    const subj = emailSubject(referralBy);
    const body = emailBody(validated.name, validated.age, referralBy);
    await sendEmail_IO_Async(emailService, validated.email, subj, body).catch(() => {});
  }

  return user;
}
